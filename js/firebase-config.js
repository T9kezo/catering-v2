// Supabase configuration
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Replace with your Supabase URL and anon key
const supabaseUrl = 'https://clknopakptqgaaaangiw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsa25vcGFrcHRxZ2FhYWFuZ2l3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzQ5ODAsImV4cCI6MjA3ODk1MDk4MH0.nJBKoqejkHHf5dyV9EJFX7x-rI20xsEwC26UJSHhNuo';

export const supabase = createClient(supabaseUrl, supabaseKey);

// ---- Toast Notification System ----
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastWrapper');
  if (!container) return;

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `savor-toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] ?? icons.info}</span><span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('exiting');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// Structured action logger
export function logAction(action, details = {}) {
  console.log(`[${new Date().toISOString()}] ${action}:`, details);
}
