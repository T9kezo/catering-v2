// User dashboard — search/filter, quantity controls, cart drawer, reviews, toasts
import { supabase, showToast, logAction } from './firebase-config.js';
import { logoutUser, onAuthStateChange } from './auth.js';

// ---- State ----
let cart = JSON.parse(sessionStorage.getItem('savorCart') || '[]');
let allProducts = [];
let activeCategory = 'all';
let currentUser = null;
let reviewRating = 0;

// ---- Cart Persistence ----
function saveCart() { sessionStorage.setItem('savorCart', JSON.stringify(cart)); }

// ---- Cart Badge ----
function updateCartBadge() {
  const count = cart.reduce((t, i) => t + i.quantity, 0);
  const badge = document.getElementById('cartBadge');
  badge.textContent = count;
  badge.classList.toggle('visible', count > 0);
}

// ---- Cart Calculations ----
function getCartSubtotal() { return cart.reduce((s, i) => s + i.price * i.quantity, 0); }
function formatPrice(n)    { return `₹${n.toFixed(2)}`; }

// ---- Add to Cart ----
function addToCart(product) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) { existing.quantity += 1; }
  else           { cart.push({ ...product, quantity: 1 }); }
  saveCart();
  updateCartBadge();
  logAction('Added to cart', { id: product.id, name: product.name });
  showToast(`${product.name} added to cart`, 'success', 2000);
}

// ---- Update Quantity ----
function updateQty(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.quantity = Math.max(0, item.quantity + delta);
  if (item.quantity === 0) cart = cart.filter(i => i.id !== productId);
  saveCart();
  updateCartBadge();
  renderCartDrawer();
}

// ---- Render Cart Drawer ----
function renderCartDrawer() {
  const list = document.getElementById('cartItemsList');
  if (cart.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:3rem 1rem;">
        <div class="empty-state-icon">🛒</div>
        <h3>Your cart is empty</h3>
        <p>Add some delicious items from the menu</p>
      </div>`;
    document.getElementById('placeOrderBtn').disabled = true;
  } else {
    document.getElementById('placeOrderBtn').disabled = false;
    list.innerHTML = cart.map(item => `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.image_url || 'https://placehold.co/56x56/F0E8DC/8A7060?text=🍽'}" alt="${escHtml(item.name)}">
        <div class="cart-item-info">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          <div class="cart-item-unit-price">${formatPrice(item.price)} each</div>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="window._updateQty('${item.id}', -1)">−</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" onclick="window._updateQty('${item.id}', 1)">+</button>
          </div>
        </div>
        <span class="cart-item-total">${formatPrice(item.price * item.quantity)}</span>
        <button class="cart-item-remove" onclick="window._updateQty('${item.id}', -item.quantity)" title="Remove">✕</button>
      </div>`).join('');
  }

  const sub = getCartSubtotal();
  const tax = sub * 0.05;
  document.getElementById('cartSubtotal').textContent = formatPrice(sub);
  document.getElementById('cartTax').textContent      = formatPrice(tax);
  document.getElementById('cartTotal').textContent    = formatPrice(sub + tax);
}

// Expose for inline handlers
window._updateQty = (id, delta) => {
  // Handle removing all by passing large negative
  const item = cart.find(i => i.id === id);
  if (!item) return;
  if (delta <= -item.quantity) { cart = cart.filter(i => i.id !== id); }
  else { item.quantity = Math.max(1, item.quantity + delta); }
  saveCart(); updateCartBadge(); renderCartDrawer();
};

// ---- Open/Close Cart Drawer ----
function openCart()  { document.getElementById('cartDrawer').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); renderCartDrawer(); }
function closeCart() { document.getElementById('cartDrawer').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); }

// ---- Place Order ----
async function placeOrder() {
  if (!cart.length) { showToast('Your cart is empty!', 'warning'); return; }
  if (!currentUser)  { showToast('Please log in again.', 'error'); return; }

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Placing…';

  const sub   = getCartSubtotal();
  const total = sub * 1.05;

  const { error } = await supabase.from('orders').insert([{
    customer_id:    currentUser.id,
    customer_email: currentUser.email,
    items:          cart,
    total:          parseFloat(total.toFixed(2)),
    status:         'pending',
    created_at:     new Date().toISOString()
  }]);

  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-check-circle"></i> Place Order';

  if (error) {
    logAction('Order failed', { error: error.message });
    showToast('Failed to place order: ' + error.message, 'error');
    return;
  }

  cart = [];
  saveCart();
  updateCartBadge();
  closeCart();
  showToast('🎉 Order placed successfully!', 'success', 4000);
  logAction('Order placed', { total });
}

// ---- Render Products ----
function renderProducts(products) {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>No items found</h3>
        <p>Try a different search or category</p>
      </div>`;
    return;
  }

  container.innerHTML = products.map(p => `
    <div class="product-card">
      <div class="product-img-wrap">
        <img src="${p.image_url || 'https://placehold.co/400x200/F0E8DC/8A7060?text=🍽'}" alt="${escHtml(p.name)}" loading="lazy">
        ${p.category ? `<span class="product-category-tag">${escHtml(capitalize(p.category))}</span>` : ''}
      </div>
      <div class="product-body">
        <div class="product-name">${escHtml(p.name)}</div>
        <div class="product-desc">${escHtml(p.description || '')}</div>
        <div class="product-footer">
          <span class="product-price">${formatPrice(p.price)}</span>
          <button class="btn-add-cart" data-id="${p.id}">
            <i class="bi bi-plus"></i> Add
          </button>
        </div>
      </div>
    </div>`).join('');

  container.querySelectorAll('.btn-add-cart').forEach(btn => {
    btn.addEventListener('click', e => {
      const p = products.find(x => x.id === btn.dataset.id);
      if (p) {
        addToCart(p);
        btn.classList.add('adding');
        setTimeout(() => btn.classList.remove('adding'), 300);
      }
    });
  });

  document.getElementById('productCount').textContent = `${products.length} item${products.length !== 1 ? 's' : ''}`;
}

// ---- Filter Products ----
function filterProducts() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
  let filtered = allProducts;
  if (activeCategory !== 'all') filtered = filtered.filter(p => p.category === activeCategory);
  if (query) filtered = filtered.filter(p =>
    p.name.toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query)
  );
  renderProducts(filtered);
}

// ---- Load Products Page ----
function loadProducts() {
  setActiveNav('viewProductsTab');
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-hero">
      <div class="page-hero-greeting">Good ${getGreeting()}!</div>
      <h1>What are you <em>craving</em> today?</h1>
    </div>
    <div class="category-strip" id="categoryStrip">
      <label>Filter by:</label>
      <button class="category-pill active" data-cat="all">All Items</button>
      <button class="category-pill" data-cat="starters">Starters</button>
      <button class="category-pill" data-cat="mains">Mains</button>
      <button class="category-pill" data-cat="desserts">Desserts</button>
      <button class="category-pill" data-cat="beverages">Beverages</button>
      <button class="category-pill" data-cat="snacks">Snacks</button>
      <button class="category-pill" data-cat="specials">Specials</button>
    </div>
    <div class="section-header">
      <span class="section-title">Menu</span>
      <span class="section-count" id="productCount">Loading…</span>
    </div>
    <div class="products-grid" id="productsGrid">
      ${[...Array(6)].map(() => `
        <div class="skeleton-card">
          <div class="skeleton skeleton-img"></div>
          <div class="skeleton skeleton-text" style="margin-top:.75rem;"></div>
          <div class="skeleton skeleton-text short"></div>
          <div class="skeleton skeleton-btn"></div>
        </div>`).join('')}
    </div>`;

  // Category pills
  document.getElementById('categoryStrip').addEventListener('click', e => {
    const pill = e.target.closest('.category-pill');
    if (!pill) return;
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeCategory = pill.dataset.cat;
    filterProducts();
  });

  loadProductsData();
}

async function loadProductsData() {
  const { data: products, error } = await supabase
    .from('products').select('*').order('created_at', { ascending: false });

  if (error) { showToast('Failed to load products: ' + error.message, 'error'); return; }

  allProducts = products || [];
  filterProducts();

  // Real-time updates
  supabase.channel('products_rt').on('postgres_changes',
    { event: '*', schema: 'public', table: 'products' },
    () => loadProductsData()
  ).subscribe();
}

// ---- Load Orders ----
async function loadUserOrders() {
  setActiveNav('myOrdersTab');
  if (!currentUser) return;

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="page-hero">
      <div class="page-hero-greeting">Your History</div>
      <h1>My <em>Orders</em></h1>
    </div>
    <div class="orders-list" id="ordersList">
      <div style="text-align:center;padding:3rem;color:var(--text-muted);">
        <span class="spinner-border"></span>
      </div>
    </div>`;

  const { data: orders, error } = await supabase
    .from('orders').select('*').eq('customer_id', currentUser.id)
    .order('created_at', { ascending: false });

  const list = document.getElementById('ordersList');
  if (error) { list.innerHTML = `<p style="color:var(--terracotta);">Failed to load orders.</p>`; return; }

  if (!orders?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No orders yet</h3>
        <p>Browse the menu and place your first order!</p>
      </div>`;
    return;
  }

  list.innerHTML = orders.map((o, i) => `
    <div class="order-card" style="animation-delay:${i * 0.05}s;">
      <div>
        <div class="order-id">Order #${o.id.slice(-8).toUpperCase()}</div>
        <div class="order-items-text">${(o.items || []).map(x => `${x.name} ×${x.quantity}`).join(', ')}</div>
        <div class="order-date">${new Date(o.created_at).toLocaleString()}</div>
        ${o.review ? `<div style="margin-top:.5rem;font-size:.78rem;color:var(--text-muted);">Your review: ${'★'.repeat(o.review.rating)}${'☆'.repeat(5 - o.review.rating)}</div>` : ''}
      </div>
      <div class="order-meta">
        <span class="status-badge ${(o.status || 'pending').toLowerCase()}">${capitalize(o.status || 'Pending')}</span>
        <span class="order-total">${formatPrice(o.total)}</span>
        ${o.status === 'completed' && !o.review
          ? `<button class="btn-review" data-order-id="${o.id}"><i class="bi bi-star me-1"></i>Review</button>`
          : o.review ? `<button class="btn-review reviewed" disabled><i class="bi bi-star-fill me-1"></i>Reviewed</button>` : ''}
      </div>
    </div>`).join('');

  // Review buttons
  list.querySelectorAll('.btn-review:not(.reviewed)').forEach(btn => {
    btn.addEventListener('click', () => openReviewModal(btn.dataset.orderId));
  });
}

// ---- Review Modal ----
function openReviewModal(orderId) {
  reviewRating = 0;
  document.getElementById('reviewOrderId').value = orderId;
  document.getElementById('reviewText').value = '';
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
  new bootstrap.Modal(document.getElementById('reviewModal')).show();
}

// ---- Load Profile ----
async function loadProfile() {
  setActiveNav('myProfileTab');
  if (!currentUser) return;

  const { data: orders } = await supabase.from('orders').select('total,status')
    .eq('customer_id', currentUser.id);
  const totalSpent   = (orders || []).reduce((s, o) => s + o.total, 0);
  const completedOrders = (orders || []).filter(o => o.status === 'completed').length;

  const initials = (currentUser.email || 'U')[0].toUpperCase();
  document.getElementById('mainContent').innerHTML = `
    <div class="page-hero">
      <div class="page-hero-greeting">Account</div>
      <h1>My <em>Profile</em></h1>
    </div>
    <div class="profile-card">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-email">${escHtml(currentUser.email)}</div>
      <div class="profile-since">Member since ${new Date(currentUser.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })}</div>
      <div class="profile-stats">
        <div class="profile-stat-item">
          <span class="profile-stat-num">${(orders || []).length}</span>
          <span class="profile-stat-label">Total Orders</span>
        </div>
        <div class="profile-stat-item">
          <span class="profile-stat-num">${completedOrders}</span>
          <span class="profile-stat-label">Completed</span>
        </div>
        <div class="profile-stat-item">
          <span class="profile-stat-num">${formatPrice(totalSpent)}</span>
          <span class="profile-stat-label">Total Spent</span>
        </div>
      </div>
      <p style="font-size:.8rem;color:var(--text-muted);">User ID: ${currentUser.id}</p>
    </div>`;
}

// ---- Utilities ----
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
function setActiveNav(id) {
  document.querySelectorAll('.nav-pill-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  // Hide search for non-menu views
  document.getElementById('navSearch').style.visibility = id === 'viewProductsTab' ? 'visible' : 'hidden';
}

// ---- Access Check ----
function checkUserAccess() {
  onAuthStateChange(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    const userType = user.user_metadata?.user_type;
    if (userType === 'admin') { window.location.href = 'admin.html'; return; }
    currentUser = user;
  });
}

// ================================================================
// Init
// ================================================================
if (document.getElementById('mainContent')) {
  checkUserAccess();
  updateCartBadge();

  // Search input (debounced)
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterProducts, 250);
  });

  // Nav
  document.getElementById('viewProductsTab').addEventListener('click', loadProducts);
  document.getElementById('myOrdersTab').addEventListener('click', loadUserOrders);
  document.getElementById('myProfileTab').addEventListener('click', loadProfile);

  // Cart
  document.getElementById('cartBtn').addEventListener('click', openCart);
  document.getElementById('cartCloseBtn').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
  document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);

  // Review star buttons
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      reviewRating = parseInt(btn.dataset.val);
      document.querySelectorAll('.star-btn').forEach((b, idx) => b.classList.toggle('active', idx < reviewRating));
    });
  });

  // Submit review
  document.getElementById('submitReviewBtn').addEventListener('click', async () => {
    const orderId = document.getElementById('reviewOrderId').value;
    const text    = document.getElementById('reviewText').value.trim();
    if (!reviewRating) { showToast('Please select a star rating.', 'warning'); return; }

    const { error } = await supabase.from('orders')
      .update({ review: { rating: reviewRating, text, at: new Date().toISOString() } })
      .eq('id', orderId);

    if (error) { showToast('Failed to submit review.', 'error'); return; }
    bootstrap.Modal.getInstance(document.getElementById('reviewModal'))?.hide();
    showToast('Review submitted! Thank you ✨', 'success');
    loadUserOrders();
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    const res = await logoutUser();
    if (res.success) { sessionStorage.removeItem('savorCart'); window.location.href = 'index.html'; }
    else showToast('Logout failed: ' + res.error, 'error');
  });

  // Load default view
  loadProducts();
}
