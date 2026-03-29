// Admin dashboard — sidebar navigation, stats, product/order management, toasts
import { supabase, showToast, logAction } from './firebase-config.js';
import { logoutUser, onAuthStateChange } from './auth.js';

// ---- State ----
let allProducts = [];
let selectedProductIds = new Set();

// ---- Utilities ----
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function formatPrice(n)  { return `₹${parseFloat(n).toFixed(2)}`; }

function setButtonLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const spin = btn.querySelector('.btn-spinner');
  if (text) text.classList.toggle('d-none', loading);
  if (spin) spin.classList.toggle('d-none', !loading);
  btn.disabled = loading;
}

// ---- Sidebar Navigation ----
function initSidebar() {
  document.querySelectorAll('.sidebar-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      document.querySelectorAll('.sidebar-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`section-${section}`)?.classList.add('active');

      // Lazy load data for each section
      if (section === 'dashboard')        loadDashboardStats();
      if (section === 'manage-products')  loadProducts();
      if (section === 'orders')           loadOrders();
    });
  });
}

// ---- Dashboard Stats ----
async function loadDashboardStats() {
  try {
    const [{ data: products }, { data: orders }] = await Promise.all([
      supabase.from('products').select('id'),
      supabase.from('orders').select('total, status, created_at, customer_email, id, items')
            .order('created_at', { ascending: false })
    ]);

    document.getElementById('totalProducts').textContent = products?.length ?? '—';
    document.getElementById('totalOrders').textContent   = orders?.length ?? '—';
    const revenue = (orders || []).reduce((s, o) => s + parseFloat(o.total || 0), 0);
    document.getElementById('totalRevenue').textContent  = formatPrice(revenue);

    // Recent orders (last 5)
    const recent = (orders || []).slice(0, 5);
    const recentEl = document.getElementById('recentOrdersList');
    if (recentEl) {
      recentEl.innerHTML = recent.length
        ? recent.map(o => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--border);font-size:.8rem;">
              <div>
                <span style="font-weight:600;color:var(--espresso);">#${o.id.slice(-6).toUpperCase()}</span>
                <span style="color:var(--text-muted);margin-left:.5rem;">${escHtml(o.customer_email)}</span>
              </div>
              <div style="display:flex;align-items:center;gap:.5rem;">
                <span class="status-badge ${(o.status||'pending').toLowerCase()}">${capitalize(o.status||'pending')}</span>
                <span style="font-family:var(--font-display);font-weight:600;color:var(--terracotta);">${formatPrice(o.total)}</span>
              </div>
            </div>`).join('')
        : `<p style="color:var(--text-muted);font-size:.85rem;">No orders yet.</p>`;
    }

    // Status breakdown
    const breakdown = (orders || []).reduce((acc, o) => {
      const s = (o.status || 'pending').toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const statusEl = document.getElementById('statusBreakdown');
    if (statusEl) {
      const total = orders?.length || 1;
      const colors = { pending: 'var(--amber)', confirmed: 'var(--sage)', completed: '#3D6B3F', cancelled: 'var(--terracotta)' };
      statusEl.innerHTML = Object.entries(breakdown).map(([status, count]) => `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:.2rem;">
            <span style="font-weight:600;color:var(--espresso);">${capitalize(status)}</span>
            <span style="color:var(--text-muted);">${count}</span>
          </div>
          <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${(count/total*100).toFixed(1)}%;background:${colors[status]||'var(--latte)'};border-radius:3px;transition:width .5s var(--ease);"></div>
          </div>
        </div>`).join('');
    }

    logAction('Dashboard stats loaded', { products: products?.length, orders: orders?.length, revenue });
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ---- Add Product ----
async function addProduct(name, price, description, imageFile, category) {
  try {
    logAction('Adding product', { name, price, category });
    const imageUrl = await fileToBase64(imageFile);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('products').insert([{
      name:        name.trim(),
      price:       parseFloat(price),
      description: description.trim(),
      image_url:   imageUrl,
      category:    category,
      created_at:  new Date().toISOString(),
      created_by:  user.id
    }]).select();

    if (error) throw error;
    logAction('Product added', { id: data[0].id });
    return { success: true };
  } catch (err) {
    logAction('Add product failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ---- Load Products ----
function loadProducts() {
  selectedProductIds.clear();
  updateBulkActionsBar();
  loadProductsData();

  supabase.channel('admin_products_rt').on('postgres_changes',
    { event: '*', schema: 'public', table: 'products' },
    () => loadProductsData()
  ).subscribe();
}

async function loadProductsData() {
  const { data: products, error } = await supabase
    .from('products').select('*').order('created_at', { ascending: false });

  if (error) { showToast('Failed to load products.', 'error'); return; }
  allProducts = products || [];

  const grid = document.getElementById('productsList');
  if (!grid) return;

  if (!allProducts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">📦</div><h3>No products yet</h3><p>Add your first product above.</p></div>`;
    return;
  }

  grid.innerHTML = allProducts.map(p => `
    <div class="admin-product-card">
      <input type="checkbox" class="admin-checkbox product-checkbox" value="${p.id}" id="chk-${p.id}">
      <img src="${escHtml(p.image_url || '')}" alt="${escHtml(p.name)}" onerror="this.src='https://placehold.co/240x160/F0E8DC/8A7060?text=🍽'">
      <div class="admin-product-info">
        <div class="admin-product-name">${escHtml(p.name)}</div>
        ${p.category ? `<span class="status-badge pending" style="margin-bottom:.4rem;display:inline-block;">${capitalize(p.category)}</span>` : ''}
        <div class="admin-product-price">${formatPrice(p.price)}</div>
        <div class="admin-product-actions">
          <button class="btn-edit-sm" data-id="${p.id}"><i class="bi bi-pencil me-1"></i>Edit</button>
          <button class="btn-danger-sm" data-id="${p.id}"><i class="bi bi-trash me-1"></i>Delete</button>
        </div>
      </div>
    </div>`).join('');

  // Checkboxes
  grid.querySelectorAll('.product-checkbox').forEach(cb => {
    cb.checked = selectedProductIds.has(cb.value);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedProductIds.add(cb.value);
      else            selectedProductIds.delete(cb.value);
      updateBulkActionsBar();
    });
  });

  // Edit
  grid.querySelectorAll('.btn-edit-sm').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });

  // Delete
  grid.querySelectorAll('.btn-danger-sm').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove "${allProducts.find(p=>p.id===btn.dataset.id)?.name}"?`)) return;
      await removeProduct(btn.dataset.id);
    });
  });

  logAction('Products loaded', { count: allProducts.length });
}

// ---- Bulk Delete ----
function updateBulkActionsBar() {
  const bar = document.getElementById('bulkActionsBar');
  const n   = selectedProductIds.size;
  if (bar) {
    bar.classList.toggle('visible', n > 0);
    const cnt = bar.querySelector('#selectedCount');
    if (cnt) cnt.textContent = `${n} product${n !== 1 ? 's' : ''} selected`;
  }
}

async function bulkDeleteProducts(ids) {
  const { error } = await supabase.from('products').delete().in('id', [...ids]);
  if (error) throw error;
}

// ---- Remove Product ----
async function removeProduct(id) {
  try {
    logAction('Removing product', { id });
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    showToast('Product removed.', 'success');
    loadDashboardStats();
    logAction('Product removed', { id });
  } catch (err) {
    showToast('Failed to remove: ' + err.message, 'error');
  }
}

// ---- Edit Modal ----
function openEditModal(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  document.getElementById('editProductId').value          = p.id;
  document.getElementById('editProductName').value        = p.name;
  document.getElementById('editProductPrice').value       = p.price;
  document.getElementById('editProductDescription').value = p.description || '';
  document.getElementById('editProductCategory').value    = p.category || 'specials';
  document.getElementById('editProductImage').value       = '';
  new bootstrap.Modal(document.getElementById('editProductModal')).show();
}

async function editProduct(id, name, price, description, imageFile, category) {
  try {
    const updateData = { name: name.trim(), price: parseFloat(price), description: description.trim(), category };
    if (imageFile) updateData.image_url = await fileToBase64(imageFile);
    const { error } = await supabase.from('products').update(updateData).eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---- Load Orders ----
function loadOrders() {
  loadOrdersData();
  supabase.channel('admin_orders_rt').on('postgres_changes',
    { event: '*', schema: 'public', table: 'orders' },
    () => loadOrdersData()
  ).subscribe();
}

async function loadOrdersData() {
  const { data: orders, error } = await supabase
    .from('orders').select('*').order('created_at', { ascending: false });

  const tbody = document.getElementById('ordersList');
  if (!tbody) return;
  if (error) { showToast('Failed to load orders.', 'error'); return; }

  if (!orders?.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted);">No orders yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><span style="font-size:.75rem;font-weight:700;color:var(--espresso);">#${o.id.slice(-8).toUpperCase()}</span></td>
      <td style="font-size:.8rem;color:var(--text-muted);">${escHtml(o.customer_email)}</td>
      <td style="font-size:.8rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(o.items||[]).map(i=>`${escHtml(i.name)} ×${i.quantity}`).join(', ')}</td>
      <td><span style="font-family:var(--font-display);font-weight:600;color:var(--terracotta);">${formatPrice(o.total)}</span></td>
      <td style="font-size:.78rem;color:var(--text-muted);white-space:nowrap;">${new Date(o.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td>
      <td><span class="status-badge ${(o.status||'pending').toLowerCase()}">${capitalize(o.status||'pending')}</span></td>
      <td>
        <select class="status-select" id="status-${o.id}">
          <option value="pending"   ${o.status==='pending'   ?'selected':''}>Pending</option>
          <option value="confirmed" ${o.status==='confirmed' ?'selected':''}>Confirmed</option>
          <option value="completed" ${o.status==='completed' ?'selected':''}>Completed</option>
          <option value="cancelled" ${o.status==='cancelled' ?'selected':''}>Cancelled</option>
        </select>
        <button class="update-status-btn" data-id="${o.id}">Save</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.update-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = document.getElementById(`status-${btn.dataset.id}`).value;
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', btn.dataset.id);
      if (error) { showToast('Failed to update status.', 'error'); return; }
      showToast('Order status updated!', 'success');
      logAction('Order status updated', { id: btn.dataset.id, newStatus });
      loadOrdersData();
    });
  });

  logAction('Orders loaded', { count: orders.length });
}

// ---- File to Base64 ----
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(new Error('Image read failed'));
    r.readAsDataURL(file);
  });
}

// ---- Access Check ----
function checkAdminAccess() {
  onAuthStateChange(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    const userType = user.user_metadata?.user_type;
    if (userType !== 'admin') {
      showToast('Access denied — admin privileges required.', 'error');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
      return;
    }
    const emailEl = document.getElementById('adminEmailDisplay');
    if (emailEl) emailEl.textContent = user.email;
  });
}

// ================================================================
// Init
// ================================================================
if (document.getElementById('section-dashboard')) {
  checkAdminAccess();
  initSidebar();
  loadDashboardStats();

  // Description char counter
  document.getElementById('productDescription')?.addEventListener('input', function() {
    document.getElementById('descCharCount').textContent = this.value.length;
  });

  // Add product form
  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name        = document.getElementById('productName').value.trim();
    const price       = document.getElementById('productPrice').value;
    const description = document.getElementById('productDescription').value.trim();
    const category    = document.getElementById('productCategory').value;
    const imageFile   = document.getElementById('productImage').files[0];
    const btn         = document.getElementById('addProductBtn');

    // Validation
    let hasError = false;
    if (!name)        { document.getElementById('productNameError').textContent = 'Name is required.'; document.getElementById('productNameError').classList.add('visible'); hasError = true; }
    else              { document.getElementById('productNameError').classList.remove('visible'); }
    if (!price || parseFloat(price) <= 0) { document.getElementById('productPriceError').textContent = 'Enter a valid price.'; document.getElementById('productPriceError').classList.add('visible'); hasError = true; }
    else              { document.getElementById('productPriceError').classList.remove('visible'); }
    if (!imageFile)   { showToast('Please select a product image.', 'warning'); hasError = true; }
    if (!category)    { showToast('Please select a category.', 'warning'); hasError = true; }
    if (hasError) return;

    setButtonLoading(btn, true);
    const result = await addProduct(name, price, description, imageFile, category);
    setButtonLoading(btn, false);

    if (result.success) {
      showToast('Product added successfully! 🎉', 'success');
      document.getElementById('productForm').reset();
      document.getElementById('descCharCount').textContent = '0';
      loadDashboardStats();
    } else {
      showToast('Failed to add product: ' + result.error, 'error');
    }
  });

  // Save edit
  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const id          = document.getElementById('editProductId').value;
    const name        = document.getElementById('editProductName').value.trim();
    const price       = document.getElementById('editProductPrice').value;
    const description = document.getElementById('editProductDescription').value.trim();
    const category    = document.getElementById('editProductCategory').value;
    const imageFile   = document.getElementById('editProductImage').files[0] || null;

    if (!name || !price) { showToast('Name and price are required.', 'warning'); return; }

    const result = await editProduct(id, name, price, description, imageFile, category);
    if (result.success) {
      bootstrap.Modal.getInstance(document.getElementById('editProductModal'))?.hide();
      showToast('Product updated!', 'success');
      loadProductsData();
    } else {
      showToast('Update failed: ' + result.error, 'error');
    }
  });

  // Bulk delete
  document.getElementById('bulkDeleteBtn')?.addEventListener('click', async () => {
    const n = selectedProductIds.size;
    if (!n) return;
    if (!confirm(`Delete ${n} product${n !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      await bulkDeleteProducts(selectedProductIds);
      showToast(`Deleted ${n} product${n !== 1 ? 's' : ''}.`, 'success');
      selectedProductIds.clear();
      updateBulkActionsBar();
      loadProductsData();
      loadDashboardStats();
    } catch (err) {
      showToast('Bulk delete failed: ' + err.message, 'error');
    }
  });

  // Clear selection
  document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
    selectedProductIds.clear();
    updateBulkActionsBar();
    document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = false);
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    const res = await logoutUser();
    if (res.success) window.location.href = 'index.html';
    else showToast('Logout failed.', 'error');
  });
}
