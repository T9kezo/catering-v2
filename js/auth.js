// Authentication — overhauled with validation, admin invite code, toast notifications
import { supabase, showToast, logAction } from './firebase-config.js';

// Admin invite code (in production, validate server-side)
const ADMIN_INVITE_CODE = 'SAVOR_ADMIN_2024';

// ---- Helpers ----
function setButtonLoading(btn, loading) {
  btn.querySelector('.btn-text').classList.toggle('d-none', loading);
  btn.querySelector('.btn-spinner').classList.toggle('d-none', !loading);
  btn.disabled = loading;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}
function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.classList.remove('visible'); }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getPasswordStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score; // 0-4
}

// ---- Register ----
export async function registerUser(email, password, userType) {
  try {
    logAction('User registration attempt', { email, userType });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { user_type: userType } }
    });
    if (error) throw error;
    logAction('User registered successfully', { id: data.user?.id, userType });
    return { success: true, user: data.user };
  } catch (error) {
    logAction('Registration failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

// ---- Login ----
export async function loginUser(email, password) {
  try {
    logAction('Login attempt', { email });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const userType = data.user.user_metadata?.user_type || 'user';
    logAction('Login successful', { id: data.user.id, userType });
    return { success: true, user: data.user, userType };
  } catch (error) {
    logAction('Login failed', { error: error.message });
    const needsConfirmation = /email_not_confirmed|Email not confirmed/i.test(error.message);
    return { success: false, error: error.message, needsConfirmation };
  }
}

// ---- Resend confirmation ----
export async function resendConfirmationEmail(email) {
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ---- Logout ----
export async function logoutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ---- Auth state observer ----
export function onAuthStateChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
}

// ================================================================
// Index page listeners
// ================================================================
if (document.getElementById('loginForm')) {

  // Password show/hide toggles
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const isText = target.type === 'text';
      target.type = isText ? 'password' : 'text';
      btn.innerHTML = `<i class="bi bi-eye${isText ? '' : '-slash'}"></i>`;
    });
  });

  // Password strength meter
  const regPwd = document.getElementById('registerPassword');
  const strengthEl = document.getElementById('passwordStrength');
  const levels = ['', 'strength-weak', 'strength-fair', 'strength-good', 'strength-strong'];
  regPwd?.addEventListener('input', () => {
    const score = getPasswordStrength(regPwd.value);
    strengthEl.className = `password-strength mt-2 ${levels[score] || ''}`;
    clearFieldError('registerPasswordError');
  });

  // Admin toggle
  const adminToggle = document.getElementById('isAdminToggle');
  const adminCodeSection = document.getElementById('adminCodeSection');
  adminToggle?.addEventListener('change', () => {
    adminCodeSection.classList.toggle('d-none', !adminToggle.checked);
    if (!adminToggle.checked) document.getElementById('adminCode').value = '';
  });

  // ---- LOGIN FORM ----
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldError('loginEmailError');

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');

    if (!validateEmail(email)) {
      showFieldError('loginEmailError', 'Please enter a valid email address.');
      return;
    }
    if (!password) {
      showToast('Please enter your password.', 'warning');
      return;
    }

    setButtonLoading(btn, true);
    const result = await loginUser(email, password);
    setButtonLoading(btn, false);

    if (result.success) {
      showToast('Welcome back! Redirecting…', 'success');
      setTimeout(() => {
        window.location.href = result.userType === 'admin' ? 'admin.html' : 'user.html';
      }, 600);
    } else if (result.needsConfirmation) {
      document.getElementById('confirmationMessage').classList.remove('d-none');

      document.getElementById('resendBtn').onclick = async () => {
        const res = await resendConfirmationEmail(email);
        if (res.success) {
          showToast('Confirmation email sent! Check your inbox.', 'success');
          document.getElementById('confirmationMessage').classList.add('d-none');
        } else {
          showToast('Failed to resend: ' + res.error, 'error');
        }
      };
    } else {
      showToast('Login failed: ' + result.error, 'error');
    }
  });

  // ---- REGISTER FORM ----
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldError('registerEmailError');
    clearFieldError('registerPasswordError');
    clearFieldError('adminCodeError');

    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const isAdmin = document.getElementById('isAdminToggle').checked;
    const adminCode = document.getElementById('adminCode').value.trim();
    const btn = document.getElementById('registerBtn');

    let hasError = false;

    if (!validateEmail(email)) {
      showFieldError('registerEmailError', 'Please enter a valid email address.');
      hasError = true;
    }
    if (password.length < 8) {
      showFieldError('registerPasswordError', 'Password must be at least 8 characters.');
      hasError = true;
    }
    if (isAdmin && adminCode !== ADMIN_INVITE_CODE) {
      showFieldError('adminCodeError', 'Invalid invite code. Contact your administrator.');
      hasError = true;
    }
    if (hasError) return;

    const userType = isAdmin ? 'admin' : 'user';
    setButtonLoading(btn, true);
    const result = await registerUser(email, password, userType);
    setButtonLoading(btn, false);

    if (result.success) {
      showToast('Account created! Please check your email to confirm.', 'success', 5000);
      document.getElementById('login-tab').click();
      document.getElementById('registerForm').reset();
      strengthEl.className = 'password-strength mt-2';
      adminCodeSection.classList.add('d-none');
    } else {
      showToast('Registration failed: ' + result.error, 'error');
    }
  });

  // Clear errors on input
  document.getElementById('loginEmail').addEventListener('input', () => clearFieldError('loginEmailError'));
  document.getElementById('registerEmail').addEventListener('input', () => clearFieldError('registerEmailError'));
}
