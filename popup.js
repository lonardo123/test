'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // عناصر الواجهة
  const userIdDisplay = document.getElementById('userIdDisplay');
  const balanceDisplay = document.getElementById('balanceDisplay');
  const statusDisplay = document.getElementById('statusDisplay');
  const startBtn = document.getElementById('startBtn');
  const messageDiv = document.getElementById('message');
  const userIdInput = document.getElementById('userIdInput');
  const saveBtn = document.getElementById('saveBtn');
  const settingsMessage = document.getElementById('settingsMessage');

  // دالة لعرض رسالة حالة في الجزء الرئيسي
  function showMainMessage(text, type) {
    // type: 'ok' | 'error' | 'info'
    messageDiv.textContent = text || '';
    if (type === 'error') {
      messageDiv.style.backgroundColor = '#ff5555';
      messageDiv.style.color = '#111';
    } else if (type === 'ok') {
      messageDiv.style.backgroundColor = '#55aa55';
      messageDiv.style.color = '#fff';
    } else {
      messageDiv.style.backgroundColor = '#444';
      messageDiv.style.color = '#fff';
    }
  }

  // دالة لعرض رسالة في تبويب الإعدادات
  function showSettingsMessage(text, success) {
    settingsMessage.style.display = 'block';
    settingsMessage.textContent = text || '';
    settingsMessage.style.backgroundColor = success ? '#55aa55' : '#ff5555';
    settingsMessage.style.color = success ? '#0c0' : '#111';
    // اخفاء الرسالة بعد 3 ثوانٍ
    setTimeout(() => {
      settingsMessage.style.display = 'none';
    }, 3000);
  }

  // تحديث واجهة المستخدم من التخزين
  function loadState() {
    chrome.storage.local.get(['userId', 'balance', 'automationRunning', 'workerTabId'], (data) => {
      const uid = data.userId || '';
      userIdDisplay.textContent = uid ? uid : '-';
      balanceDisplay.textContent = (typeof data.balance === 'number') ? data.balance.toFixed(2) : (data.balance ? Number(data.balance).toFixed(2) : '0.00');
      const isRunning = data.automationRunning === true;
      statusDisplay.textContent = isRunning ? 'Running' : 'Idle';
      startBtn.textContent = isRunning ? 'Stop Worker' : 'Start Worker';
      // إظهار userId في حقل الإدخال إذا كان موجودا
      if (!userIdInput.value) userIdInput.value = uid;
      // تفعيل/تعطيل الأزرار بحسب الحالة
      startBtn.disabled = false;
      saveBtn.disabled = false;
    });
  }

  // تهيئة الواجهة لأول مرة
  loadState();

  // تحديث الواجهة عند تغيّر التخزين
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.automationRunning || changes.userId || changes.balance || changes.workerTabId)) {
      loadState();
    }
  });

  // تبديل التبويبات
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      const content = document.getElementById(id);
      if (content) content.classList.add('active');
    });
  });

  // حفظ الإعدادات (زر Save)
  saveBtn.addEventListener('click', () => {
    const userId = (userIdInput.value || '').trim();
    if (!userId) {
      showSettingsMessage('❌ يرجى إدخال User ID', false);
      return;
    }
    // حفظ في التخزين
    chrome.storage.local.set({ userId }, () => {
      showSettingsMessage('✅ تم الحفظ!', true);
      userIdDisplay.textContent = userId;
    });
  });

  // زر Start / Stop
  startBtn.addEventListener('click', () => {
    // منع الضغط المتكرر أثناء الانتظار
    startBtn.disabled = true;
    saveBtn.disabled = true;
    showMainMessage('تجهيز...', 'info');

    // نقرأ التخزين أولاً
    chrome.storage.local.get(['automationRunning', 'userId', 'workerTabId'], (data) => {
      const isRunning = data.automatio
