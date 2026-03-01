(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const STORAGE_KEY = 'our-world-scrapbook';
  const UNLOCK_KEY = 'ourworld_unlocked';
  const SYNC_ROOM_KEY = 'ourworld_sync_room';
  const GATE_PASSWORD = 'devotion';

  let state = {
    panX: 0,
    panY: 0,
    zoom: 1,
    items: [],
    nextZ: 1,
  };

  // ── DOM refs ───────────────────────────────────────────
  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('canvas');
  const canvasItems = document.getElementById('canvas-items');
  const toolbar = document.getElementById('toolbar');
  const zoomIndicator = document.getElementById('zoom-indicator');
  const modalOverlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const modalSave = document.getElementById('modal-save');
  const confirmOverlay = document.getElementById('confirm-overlay');
  const confirmYes = document.getElementById('confirm-yes');
  const confirmNo = document.getElementById('confirm-no');

  // ── Interaction state ──────────────────────────────────
  let isPanning = false;
  let isDragging = false;
  let dragTarget = null;
  let dragItemId = null;
  let startX = 0, startY = 0;
  let startPanX = 0, startPanY = 0;
  let startItemX = 0, startItemY = 0;
  let hasMoved = false;

  let currentModalMode = null; // 'create' | 'edit'
  let currentModalType = null;
  let editingItemId = null;
  let pendingDeleteId = null;

  let socket = null;
  let currentRoomId = null;

  function getSocketUrl() {
    if (typeof window === 'undefined') return '';
    if (typeof window.OUR_WORLD_SYNC_URL === 'string' && window.OUR_WORLD_SYNC_URL) return window.OUR_WORLD_SYNC_URL;
    const p = window.location.protocol;
    if (p === 'http:' || p === 'https:') return window.location.origin;
    return 'http://localhost:3001';
  }

  /** Derive a stable sync room id from password (same password = same data on all devices). */
  function hashPassword(password) {
    return new Promise(function (resolve, reject) {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        resolve('DEFAULT');
        return;
      }
      const enc = new TextEncoder();
      crypto.subtle.digest('SHA-256', enc.encode(password.trim()))
        .then(function (buf) {
          const hex = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
          resolve(hex.slice(0, 12).toUpperCase());
        })
        .catch(function () { resolve('DEFAULT'); });
    });
  }

  const TAPE_CLASSES = ['tape-pink', 'tape-blue', 'tape-green', 'tape-yellow', 'tape-purple'];
  const PIN_CLASSES = ['pin-red', 'pin-blue', 'pin-green', 'pin-yellow'];
  const STICKY_COLORS = [
    { id: 'mustard', bg: '#f0d9a0', cls: 'sticky-mustard' },
    { id: 'rose', bg: '#e8b4b8', cls: 'sticky-rose' },
    { id: 'sage', bg: '#b5c9b3', cls: 'sticky-sage' },
    { id: 'sky', bg: '#a8c8e0', cls: 'sticky-sky' },
    { id: 'lavender', bg: '#c5b3d1', cls: 'sticky-lavender' },
    { id: 'peach', bg: '#f0c8a8', cls: 'sticky-peach' },
  ];
  const DATE_ICONS = ['heart', 'smile', 'flower-2', 'party-popper', 'wine', 'sun', 'moon', 'music', 'clapperboard', 'palmtree'];
  const FOOD_ICONS = ['utensils-crossed', 'cookie', 'croissant', 'pizza', 'salad', 'cake-slice', 'coffee', 'ice-cream', 'milk', 'cherry'];
  const SPOT_ICONS = ['map-pin', 'home', 'coffee', 'palmtree', 'trees', 'mountain', 'building-2', 'shopping-bag', 'theater', 'landmark'];

  // ── Helpers ────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function randRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function refreshIcons() {
    if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function viewportCenter() {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (rect.width / 2 - state.panX) / state.zoom,
      y: (rect.height / 2 - state.panY) / state.zoom,
    };
  }

  // ── Canvas Transform ───────────────────────────────────
  function applyTransform() {
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    zoomIndicator.textContent = Math.round(state.zoom * 100) + '%';
  }

  // ── Storage & state for sync ────────────────────────────
  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function setState(payload) {
    if (!payload) return;
    state.panX = payload.panX != null ? payload.panX : state.panX;
    state.panY = payload.panY != null ? payload.panY : state.panY;
    state.zoom = payload.zoom != null ? payload.zoom : state.zoom;
    state.items = Array.isArray(payload.items) ? payload.items : state.items;
    state.nextZ = payload.nextZ != null ? payload.nextZ : state.nextZ;
    if (state.items.length && state.nextZ <= Math.max(...state.items.map((i) => i.zIndex || 0))) {
      state.nextZ = Math.max(...state.items.map((i) => i.zIndex || 0)) + 1;
    }
    renderAll();
    applyTransform();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Storage full or unavailable', e);
    }
    if (typeof io !== 'undefined' && socket && socket.connected) {
      socket.emit('state', getState());
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        state.panX = saved.panX || 0;
        state.panY = saved.panY || 0;
        state.zoom = saved.zoom || 1;
        state.items = saved.items || [];
        state.nextZ = saved.nextZ || 1;
      }
    } catch (e) {
      console.warn('Failed to load state', e);
    }
  }

  const debouncedSave = debounce(save, 300);

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── Render Items ───────────────────────────────────────
  function renderAll() {
    canvasItems.innerHTML = '';
    state.items.forEach((item) => renderItem(item));
    applyTransform();
    refreshIcons();
  }

  function renderItem(item) {
    const el = document.createElement('div');
    el.className = 'canvas-item pop-in';
    el.dataset.id = item.id;
    el.style.left = item.x + 'px';
    el.style.top = item.y + 'px';
    el.style.zIndex = item.zIndex;
    el.style.setProperty('--rotation', item.rotation + 'deg');
    el.style.transform = `rotate(${item.rotation}deg)`;

    const actions = `
      <div class="item-actions">
        <button class="btn-edit-item" data-action="edit" title="Edit">✏️</button>
        <button class="btn-delete-item" data-action="delete" title="Delete">✕</button>
      </div>`;

    switch (item.type) {
      case 'photo':
        el.innerHTML = renderPhoto(item) + actions;
        el.classList.add('card-photo');
        addDecoration(el, 'tape');
        break;
      case 'sticky':
        el.innerHTML = renderSticky(item) + actions;
        el.classList.add('card-sticky', item.data.colorClass || 'sticky-mustard');
        addDecoration(el, 'pin');
        break;
      case 'date':
        el.innerHTML = renderDate(item) + actions;
        el.classList.add('card-date');
        break;
      case 'spot':
        el.innerHTML = renderSpot(item) + actions;
        el.classList.add('card-spot');
        break;
      case 'food':
        el.innerHTML = renderFood(item) + actions;
        el.classList.add('card-food');
        break;
      case 'letter':
        el.innerHTML = renderLetter(item) + actions;
        el.classList.add('card-letter');
        addDecoration(el, 'tape');
        break;
      case 'memory':
        el.innerHTML = renderMemory(item) + actions;
        el.classList.add('card-memory');
        break;
      case 'bucketlist':
        el.innerHTML = renderBucketlist(item) + actions;
        el.classList.add('card-bucketlist');
        addDecoration(el, 'pin');
        break;
      case 'quote':
        el.innerHTML = renderQuote(item) + actions;
        el.classList.add('card-quote');
        addDecoration(el, 'tape');
        break;
    }

    canvasItems.appendChild(el);
    refreshIcons();

    requestAnimationFrame(() => {
      el.addEventListener('animationend', () => el.classList.remove('pop-in'), { once: true });
    });
  }

  function addDecoration(el, type) {
    if (type === 'tape') {
      const tape = document.createElement('div');
      tape.className = `washi-tape washi-top ${pick(TAPE_CLASSES)}`;
      tape.style.setProperty('--tape-rot', randRange(-4, 4) + 'deg');
      el.appendChild(tape);
    } else {
      const pin = document.createElement('div');
      pin.className = `push-pin ${pick(PIN_CLASSES)}`;
      el.appendChild(pin);
    }
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function renderPhoto(item) {
    const d = item.data;
    return `
      <div class="photo-frame">
        <img src="${d.imageData}" alt="${esc(d.caption)}" draggable="false">
      </div>
      ${d.caption ? `<div class="photo-caption">${esc(d.caption)}</div>` : ''}`;
  }

  function renderSticky(item) {
    return `<div class="sticky-text">${esc(item.data.text)}</div>`;
  }

  function renderDate(item) {
    const d = item.data;
    const dateStr = d.date || '';
    let dayNum = '', monthStr = '';
    if (dateStr) {
      const dateObj = new Date(dateStr + 'T00:00:00');
      dayNum = dateObj.getDate();
      monthStr = dateObj.toLocaleString('en', { month: 'short' }).toUpperCase();
    }
    const moodIcon = DATE_ICONS.includes(d.emoji) ? d.emoji : 'heart';
    return `
      <div class="date-sidebar">
        ${dateStr
          ? `<div class="date-circle">
              <span class="date-day">${dayNum}</span>
              <span class="date-month">${monthStr}</span>
            </div>`
          : `<div class="date-circle"><span class="date-icon-wrap"><i data-lucide="${moodIcon}" class="date-icon-lg"></i></span></div>`}
      </div>
      <div class="date-main">
        <div class="date-title">${esc(d.title)}</div>
        <div class="date-desc">${esc(d.description)}</div>
        <div class="date-mood"><i data-lucide="${moodIcon}" class="date-mood-icon"></i></div>
      </div>`;
  }

  function renderSpot(item) {
    const d = item.data;
    const spotIcon = SPOT_ICONS.includes(d.emoji) ? d.emoji : 'map-pin';
    return `
      <div class="postcard-stripe"></div>
      <div class="spot-body">
        <div class="spot-icon"><i data-lucide="${spotIcon}" class="spot-icon-svg"></i></div>
        <div class="spot-name">${esc(d.name)}</div>
        ${d.address ? `<div class="spot-address">${esc(d.address)}</div>` : ''}
        ${d.notes ? `<div class="spot-notes">${esc(d.notes)}</div>` : ''}
      </div>
      <div class="spot-stamp"><i data-lucide="${spotIcon}" class="spot-stamp-icon"></i></div>
      <div class="postcard-stripe"></div>`;
  }

  function renderFood(item) {
    const d = item.data;
    const rating = d.rating || 0;
    const foodIcon = FOOD_ICONS.includes(d.emoji) ? d.emoji : 'utensils-crossed';
    const heartsHtml = [1, 2, 3, 4, 5].map(function (n) {
      return '<i data-lucide="heart" class="food-heart ' + (n <= rating ? 'filled' : 'muted') + '"></i>';
    }).join('');
    return `
      <div class="recipe-tab">FAVORITE</div>
      <div class="food-icon-bar"><i data-lucide="${foodIcon}" class="food-icon-svg"></i></div>
      <div class="food-body">
        <div class="food-name">${esc(d.name)}</div>
        <div class="food-rating">${heartsHtml}</div>
        ${d.notes ? `<div class="food-notes">${esc(d.notes)}</div>` : ''}
      </div>`;
  }

  function renderLetter(item) {
    const d = item.data;
    return `
      <div class="letter-seal"><i data-lucide="heart" class="letter-seal-icon"></i></div>
      <div class="letter-header">
        <span class="letter-title">${esc(d.title)}</span>
      </div>
      <div class="letter-content">${esc(d.content)}</div>`;
  }

  function renderMemory(item) {
    const d = item.data;
    return `
      <div class="film-holes top"></div>
      <div class="memory-inner">
        <div class="memory-title">${esc(d.title)}</div>
        ${d.date ? `<div class="memory-date">${esc(d.date)}</div>` : ''}
        <div class="memory-desc">${esc(d.description)}</div>
      </div>
      <div class="film-holes bottom"></div>`;
  }

  function renderBucketlist(item) {
    const d = item.data;
    const items = d.items || [];
    return `
      <div class="bucket-title">${esc(d.title)}</div>
      <ul class="bucket-list">
        ${items.map((entry) => `
          <li class="bucket-item ${entry.checked ? 'bucket-done' : ''}" data-entry-id="${esc(entry.id)}">
            <span class="bucket-check">${entry.checked ? '✓' : ''}</span>
            <span class="bucket-label">${esc(entry.text)}</span>
          </li>
        `).join('')}
      </ul>`;
  }

  function renderQuote(item) {
    const d = item.data;
    return `
      <div class="quote-text">${esc(d.quote)}</div>
      ${d.attribution ? `<div class="quote-attribution">— ${esc(d.attribution)}</div>` : ''}`;
  }

  // ── Item CRUD ──────────────────────────────────────────
  function addItem(type, data) {
    const center = viewportCenter();
    const item = {
      id: uid(),
      type: type,
      x: center.x + randRange(-80, 80),
      y: center.y + randRange(-80, 80),
      rotation: randRange(-4, 4),
      zIndex: state.nextZ++,
      data: data,
    };
    state.items.push(item);
    renderItem(item);
    debouncedSave();
    return item;
  }

  function updateItem(id, data) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    item.data = { ...item.data, ...data };
    const el = canvas.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.remove();
      renderItem(item);
    }
    debouncedSave();
  }

  function deleteItem(id) {
    const el = canvas.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add('fade-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }
    state.items = state.items.filter((i) => i.id !== id);
    debouncedSave();
  }

  function bringToFront(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    item.zIndex = state.nextZ++;
    const el = canvas.querySelector(`[data-id="${id}"]`);
    if (el) el.style.zIndex = item.zIndex;
  }

  // ── Canvas Panning ─────────────────────────────────────
  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('#toolbar') || e.target.closest('#modal-overlay') || e.target.closest('#confirm-overlay')) return;

    const itemEl = e.target.closest('.canvas-item');
    const actionBtn = e.target.closest('.item-actions button');

    if (actionBtn) {
      e.stopPropagation();
      const id = actionBtn.closest('.canvas-item').dataset.id;
      if (actionBtn.dataset.action === 'edit') {
        openEditModal(id);
      } else if (actionBtn.dataset.action === 'delete') {
        pendingDeleteId = id;
        confirmOverlay.classList.remove('hidden');
      }
      return;
    }

    if (e.target.closest('.bucket-item')) {
      e.preventDefault();
      return;
    }

    if (itemEl) {
      isDragging = true;
      dragTarget = itemEl;
      dragItemId = itemEl.dataset.id;
      startX = e.clientX;
      startY = e.clientY;
      const item = state.items.find((i) => i.id === dragItemId);
      if (item) {
        startItemX = item.x;
        startItemY = item.y;
      }
      bringToFront(dragItemId);
      hasMoved = false;
      e.preventDefault();
      return;
    }

    isPanning = true;
    viewport.classList.add('panning');
    startX = e.clientX;
    startY = e.clientY;
    startPanX = state.panX;
    startPanY = state.panY;
    hasMoved = false;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
      state.panX = startPanX + dx;
      state.panY = startPanY + dy;
      applyTransform();
    } else if (isDragging && dragTarget) {
      const dx = (e.clientX - startX) / state.zoom;
      const dy = (e.clientY - startY) / state.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
      const item = state.items.find((i) => i.id === dragItemId);
      if (item) {
        item.x = startItemX + dx;
        item.y = startItemY + dy;
        dragTarget.style.left = item.x + 'px';
        dragTarget.style.top = item.y + 'px';
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      viewport.classList.remove('panning');
      if (hasMoved) debouncedSave();
    }
    if (isDragging) {
      isDragging = false;
      dragTarget = null;
      if (hasMoved) debouncedSave();
    }
  });

  // ── Zoom ───────────────────────────────────────────────
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldZoom = state.zoom;
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    state.zoom = clamp(state.zoom + delta * state.zoom, 0.15, 5);

    const ratio = state.zoom / oldZoom;
    state.panX = mx - ratio * (mx - state.panX);
    state.panY = my - ratio * (my - state.panY);

    applyTransform();
    debouncedSave();
  }, { passive: false });

  // ── Touch Support ──────────────────────────────────────
  let lastTouchDist = 0;
  let lastTouchMid = null;
  let touchDragTarget = null;
  let touchDragItemId = null;
  let touchStartItemX = 0, touchStartItemY = 0;
  let touchStartX = 0, touchStartY = 0;

  viewport.addEventListener('touchstart', (e) => {
    if (e.target.closest('#toolbar') || e.target.closest('#modal-overlay') || e.target.closest('#confirm-overlay')) return;

    const actionBtn = e.target.closest('.item-actions button');
    if (actionBtn) {
      const id = actionBtn.closest('.canvas-item').dataset.id;
      if (actionBtn.dataset.action === 'edit') openEditModal(id);
      else if (actionBtn.dataset.action === 'delete') {
        pendingDeleteId = id;
        confirmOverlay.classList.remove('hidden');
      }
      return;
    }

    if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      lastTouchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      lastTouchMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      touchDragTarget = null;
      return;
    }

    if (e.target.closest('.bucket-item')) return;

    const itemEl = e.target.closest('.canvas-item');
    if (itemEl) {
      touchDragTarget = itemEl;
      touchDragItemId = itemEl.dataset.id;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      const item = state.items.find((i) => i.id === touchDragItemId);
      if (item) {
        touchStartItemX = item.x;
        touchStartItemY = item.y;
      }
      bringToFront(touchDragItemId);
      hasMoved = false;
      return;
    }

    isPanning = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startPanX = state.panX;
    startPanY = state.panY;
    hasMoved = false;
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const mid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };

      if (lastTouchDist > 0) {
        const rect = viewport.getBoundingClientRect();
        const mx = mid.x - rect.left;
        const my = mid.y - rect.top;
        const oldZoom = state.zoom;
        state.zoom = clamp(state.zoom * (dist / lastTouchDist), 0.15, 5);
        const ratio = state.zoom / oldZoom;
        state.panX = mx - ratio * (mx - state.panX);
        state.panY = my - ratio * (my - state.panY);
      }

      if (lastTouchMid) {
        state.panX += mid.x - lastTouchMid.x;
        state.panY += mid.y - lastTouchMid.y;
      }

      lastTouchDist = dist;
      lastTouchMid = mid;
      applyTransform();
      return;
    }

    if (touchDragTarget) {
      e.preventDefault();
      const dx = (e.touches[0].clientX - touchStartX) / state.zoom;
      const dy = (e.touches[0].clientY - touchStartY) / state.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
      const item = state.items.find((i) => i.id === touchDragItemId);
      if (item) {
        item.x = touchStartItemX + dx;
        item.y = touchStartItemY + dy;
        touchDragTarget.style.left = item.x + 'px';
        touchDragTarget.style.top = item.y + 'px';
      }
      return;
    }

    if (isPanning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
      state.panX = startPanX + dx;
      state.panY = startPanY + dy;
      applyTransform();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', () => {
    isPanning = false;
    touchDragTarget = null;
    lastTouchDist = 0;
    lastTouchMid = null;
    if (hasMoved) debouncedSave();
  });

  // ── Toolbar ────────────────────────────────────────────
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-btn');
    if (!btn) return;
    const type = btn.dataset.type;
    if (type) {
      openCreateModal(type);
    }
  });

  // ── Bucket list in-card toggle ─────────────────────────
  canvas.addEventListener('click', (e) => {
    const bucketItem = e.target.closest('.bucket-item');
    if (!bucketItem || e.target.closest('.item-actions')) return;
    const card = bucketItem.closest('.canvas-item');
    if (!card) return;
    const cardId = card.dataset.id;
    const entryId = bucketItem.dataset.entryId;
    const item = state.items.find((i) => i.id === cardId);
    if (!item || item.type !== 'bucketlist') return;
    const entry = (item.data.items || []).find((ent) => ent.id === entryId);
    if (!entry) return;
    entry.checked = !entry.checked;
    updateItem(cardId, { items: item.data.items });
  });

  document.getElementById('btn-fit').addEventListener('click', () => {
    if (state.items.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.items.forEach((item) => {
      minX = Math.min(minX, item.x - 20);
      minY = Math.min(minY, item.y - 20);
      maxX = Math.max(maxX, item.x + 300);
      maxY = Math.max(maxY, item.y + 300);
    });
    const rect = viewport.getBoundingClientRect();
    const w = maxX - minX;
    const h = maxY - minY;
    const zoom = Math.min(rect.width / (w + 80), rect.height / (h + 140), 2);
    state.zoom = clamp(zoom, 0.15, 2);
    state.panX = (rect.width - w * state.zoom) / 2 - minX * state.zoom;
    state.panY = (rect.height - h * state.zoom) / 2 - minY * state.zoom;
    applyTransform();
    debouncedSave();
  });

  // ── Modal System ───────────────────────────────────────
  function openCreateModal(type) {
    currentModalMode = 'create';
    currentModalType = type;
    editingItemId = null;
    showModal(type, {});
  }

  function openEditModal(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    currentModalMode = 'edit';
    currentModalType = item.type;
    editingItemId = id;
    showModal(item.type, item.data);
  }

  function showModal(type, data) {
    const titles = {
      photo: { icon: 'camera', text: 'Add Photo' },
      sticky: { icon: 'sticky-note', text: 'Sticky Note' },
      date: { icon: 'calendar-days', text: 'Date Log' },
      spot: { icon: 'map-pin', text: 'Favorite Spot' },
      food: { icon: 'utensils-crossed', text: 'Favorite Food' },
      letter: { icon: 'heart', text: 'Love Letter' },
      memory: { icon: 'sparkles', text: 'Memory' },
      bucketlist: { icon: 'list-checks', text: 'Bucket List' },
      quote: { icon: 'message-circle', text: 'Quote' },
    };
    const t = titles[type] || { icon: 'circle', text: type };
    if (currentModalMode === 'edit') {
      modalTitle.innerHTML = '<i data-lucide="pencil" class="modal-title-icon"></i> Edit ' + type.charAt(0).toUpperCase() + type.slice(1);
    } else {
      modalTitle.innerHTML = '<i data-lucide="' + t.icon + '" class="modal-title-icon"></i> ' + t.text;
    }
    modalBody.innerHTML = buildForm(type, data);
    modalOverlay.classList.remove('hidden');
    setupFormInteractions(type);
    refreshIcons();
    const firstInput = modalBody.querySelector('input:not([type="file"]), textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    modalBody.innerHTML = '';
    currentModalMode = null;
    currentModalType = null;
    editingItemId = null;
  }

  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // ── Confirm Dialog ─────────────────────────────────────
  confirmYes.addEventListener('click', () => {
    if (pendingDeleteId) deleteItem(pendingDeleteId);
    pendingDeleteId = null;
    confirmOverlay.classList.add('hidden');
  });

  confirmNo.addEventListener('click', () => {
    pendingDeleteId = null;
    confirmOverlay.classList.add('hidden');
  });

  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) {
      pendingDeleteId = null;
      confirmOverlay.classList.add('hidden');
    }
  });

  // ── Build Forms ────────────────────────────────────────
  function buildForm(type, data) {
    switch (type) {
      case 'photo': return formPhoto(data);
      case 'sticky': return formSticky(data);
      case 'date': return formDate(data);
      case 'spot': return formSpot(data);
      case 'food': return formFood(data);
      case 'letter': return formLetter(data);
      case 'memory': return formMemory(data);
      case 'bucketlist': return formBucketlist(data);
      case 'quote': return formQuote(data);
      default: return '';
    }
  }

  function formPhoto(d) {
    return `
      <div class="form-group">
        <label>Choose a photo</label>
        <input type="file" id="f-photo-file" accept="image/*">
        <img class="image-preview" id="f-photo-preview" src="${d.imageData || ''}" style="${d.imageData ? 'display:block' : ''}">
        <input type="hidden" id="f-photo-data" value="">
      </div>
      <div class="form-group">
        <label>Caption</label>
        <input type="text" id="f-photo-caption" placeholder="A little note about this photo..." value="${esc(d.caption || '')}">
      </div>`;
  }

  function formSticky(d) {
    const selected = d.colorClass || 'sticky-mustard';
    return `
      <div class="form-group">
        <label>Color</label>
        <div class="color-picker-row" id="f-sticky-colors">
          ${STICKY_COLORS.map((c) => `<div class="color-swatch ${c.cls === selected ? 'selected' : ''}" data-cls="${c.cls}" style="background:${c.bg}"></div>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Note</label>
        <textarea id="f-sticky-text" rows="4" placeholder="Write something sweet...">${esc(d.text || '')}</textarea>
      </div>`;
  }

  function formDate(d) {
    const sel = DATE_ICONS.includes(d.emoji) ? d.emoji : 'heart';
    return `
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="f-date-date" value="${d.date || ''}">
      </div>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="f-date-title" placeholder="e.g. Our First Date" value="${esc(d.title || '')}">
      </div>
      <div class="form-group">
        <label>What happened?</label>
        <textarea id="f-date-desc" rows="3" placeholder="Tell the story...">${esc(d.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Mood</label>
        <div class="icon-picker-row" id="f-date-emoji">
          ${DATE_ICONS.map((icon) => `<button type="button" class="icon-option ${icon === sel ? 'selected' : ''}" data-emoji="${icon}"><i data-lucide="${icon}" class="picker-icon"></i></button>`).join('')}
        </div>
      </div>`;
  }

  function formSpot(d) {
    const sel = SPOT_ICONS.includes(d.emoji) ? d.emoji : 'map-pin';
    return `
      <div class="form-group">
        <label>Spot Name</label>
        <input type="text" id="f-spot-name" placeholder="e.g. That cozy café" value="${esc(d.name || '')}">
      </div>
      <div class="form-group">
        <label>Address / Location</label>
        <input type="text" id="f-spot-address" placeholder="Optional" value="${esc(d.address || '')}">
      </div>
      <div class="form-group">
        <label>Why we love it</label>
        <textarea id="f-spot-notes" rows="3" placeholder="What makes it special?">${esc(d.notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Icon</label>
        <div class="icon-picker-row" id="f-spot-emoji">
          ${SPOT_ICONS.map((icon) => `<button type="button" class="icon-option ${icon === sel ? 'selected' : ''}" data-emoji="${icon}"><i data-lucide="${icon}" class="picker-icon"></i></button>`).join('')}
        </div>
      </div>`;
  }

  function formFood(d) {
    const sel = FOOD_ICONS.includes(d.emoji) ? d.emoji : 'utensils-crossed';
    const rating = d.rating || 0;
    return `
      <div class="form-group">
        <label>Food / Dish</label>
        <input type="text" id="f-food-name" placeholder="e.g. Mom's pasta" value="${esc(d.name || '')}">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea id="f-food-notes" rows="2" placeholder="Where, when, why we love it...">${esc(d.notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Rating</label>
        <div class="rating-row" id="f-food-rating">
          ${[1,2,3,4,5].map((n) => `<button type="button" class="rating-heart-btn" data-val="${n}"><i data-lucide="heart" class="rating-heart-icon ${n <= rating ? 'filled' : 'muted'}"></i></button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Icon</label>
        <div class="icon-picker-row" id="f-food-emoji">
          ${FOOD_ICONS.map((icon) => `<button type="button" class="icon-option ${icon === sel ? 'selected' : ''}" data-emoji="${icon}"><i data-lucide="${icon}" class="picker-icon"></i></button>`).join('')}
        </div>
      </div>`;
  }

  function formLetter(d) {
    return `
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="f-letter-title" placeholder="e.g. To My Love" value="${esc(d.title || '')}">
      </div>
      <div class="form-group">
        <label>Your letter</label>
        <textarea id="f-letter-content" rows="8" placeholder="Write from the heart...">${esc(d.content || '')}</textarea>
      </div>`;
  }

  function formMemory(d) {
    return `
      <div class="form-group">
        <label>Memory Title</label>
        <input type="text" id="f-memory-title" placeholder="e.g. The day we met" value="${esc(d.title || '')}">
      </div>
      <div class="form-group">
        <label>When</label>
        <input type="date" id="f-memory-date" value="${d.date || ''}">
      </div>
      <div class="form-group">
        <label>Tell the story</label>
        <textarea id="f-memory-desc" rows="4" placeholder="What happened? How did it feel?">${esc(d.description || '')}</textarea>
      </div>`;
  }

  function formBucketlist(d) {
    const items = d.items && d.items.length ? d.items : [{ id: uid(), text: '', checked: false }];
    return `
      <div class="form-group">
        <label>List title</label>
        <input type="text" id="f-bucket-title" placeholder="e.g. Things to do together" value="${esc(d.title || '')}">
      </div>
      <div class="form-group">
        <label>Items</label>
        <div id="f-bucket-rows">
          ${items.map((entry) => `
            <div class="bucket-row" data-entry-id="${esc(entry.id)}">
              <input type="checkbox" class="f-bucket-check" ${entry.checked ? 'checked' : ''} title="Check when done">
              <input type="text" class="f-bucket-text" placeholder="One thing to do..." value="${esc(entry.text || '')}">
              <button type="button" class="btn-remove-row" title="Remove">✕</button>
            </div>
          `).join('')}
        </div>
        <button type="button" id="f-bucket-add" class="btn btn-cancel" style="margin-top:8px">+ Add item</button>
      </div>`;
  }

  function formQuote(d) {
    return `
      <div class="form-group">
        <label>Quote / What we say</label>
        <textarea id="f-quote-text" rows="3" placeholder="That thing we always say...">${esc(d.quote || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Who said it (optional)</label>
        <input type="text" id="f-quote-attribution" placeholder="e.g. You, Me, Us" value="${esc(d.attribution || '')}">
      </div>`;
  }

  // ── Form Interactions ──────────────────────────────────
  function setupFormInteractions(type) {
    // Photo preview
    if (type === 'photo') {
      const fileInput = document.getElementById('f-photo-file');
      const preview = document.getElementById('f-photo-preview');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          compressImage(file, 600, 0.7, (dataUrl) => {
            preview.src = dataUrl;
            preview.style.display = 'block';
            document.getElementById('f-photo-data').value = dataUrl;
          });
        });
      }
    }

    // Color swatches
    const colorRow = document.getElementById('f-sticky-colors');
    if (colorRow) {
      colorRow.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        colorRow.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
        swatch.classList.add('selected');
      });
    }

    // Icon pickers
    ['f-date-emoji', 'f-spot-emoji', 'f-food-emoji'].forEach((id) => {
      const row = document.getElementById(id);
      if (row) {
        row.addEventListener('click', (e) => {
          const btn = e.target.closest('.icon-option');
          if (!btn) return;
          row.querySelectorAll('.icon-option').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      }
    });

    // Rating hearts (icons)
    const ratingRow = document.getElementById('f-food-rating');
    if (ratingRow) {
      ratingRow.addEventListener('click', (e) => {
        const btn = e.target.closest('.rating-heart-btn');
        if (!btn) return;
        const val = parseInt(btn.dataset.val);
        ratingRow.querySelectorAll('.rating-heart-btn').forEach((b) => {
          const icon = b.querySelector('.rating-heart-icon');
          if (icon) {
            icon.classList.toggle('filled', parseInt(b.dataset.val) <= val);
            icon.classList.toggle('muted', parseInt(b.dataset.val) > val);
          }
        });
      });
    }

    // Bucket list: add / remove rows
    const bucketAdd = document.getElementById('f-bucket-add');
    const bucketRows = document.getElementById('f-bucket-rows');
    if (bucketAdd && bucketRows) {
      bucketAdd.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'bucket-row';
        row.dataset.entryId = uid();
        row.innerHTML = `
          <input type="checkbox" class="f-bucket-check" title="Check when done">
          <input type="text" class="f-bucket-text" placeholder="One thing to do...">
          <button type="button" class="btn-remove-row" title="Remove">✕</button>`;
        bucketRows.appendChild(row);
      });
      bucketRows.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-row')) e.target.closest('.bucket-row').remove();
      });
    }
  }

  // ── Image Compression ──────────────────────────────────
  function compressImage(file, maxDim, quality, cb) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h / w) * maxDim; w = maxDim; }
          else { w = (w / h) * maxDim; h = maxDim; }
        }
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(c.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Save Handler ───────────────────────────────────────
  modalSave.addEventListener('click', () => {
    const data = collectFormData(currentModalType);
    if (!data) return;

    if (currentModalMode === 'edit' && editingItemId) {
      if (currentModalType === 'sticky') {
        const item = state.items.find((i) => i.id === editingItemId);
        if (item) item.data.colorClass = data.colorClass;
      }
      updateItem(editingItemId, data);
    } else {
      addItem(currentModalType, data);
    }
    closeModal();
  });

  function collectFormData(type) {
    switch (type) {
      case 'photo': {
        const stored = document.getElementById('f-photo-data').value;
        const existing = currentModalMode === 'edit'
          ? (state.items.find((i) => i.id === editingItemId) || {}).data
          : null;
        const imageData = stored || (existing && existing.imageData) || '';
        if (!imageData) { alert('Please select a photo'); return null; }
        return {
          imageData,
          caption: document.getElementById('f-photo-caption').value.trim(),
        };
      }
      case 'sticky': {
        const text = document.getElementById('f-sticky-text').value.trim();
        if (!text) { alert('Please write something'); return null; }
        const selSwatch = document.querySelector('#f-sticky-colors .color-swatch.selected');
        return {
          text,
          colorClass: selSwatch ? selSwatch.dataset.cls : 'sticky-mustard',
        };
      }
      case 'date': {
        const title = document.getElementById('f-date-title').value.trim();
        if (!title) { alert('Please add a title'); return null; }
        const selIcon = document.querySelector('#f-date-emoji .icon-option.selected');
        return {
          date: document.getElementById('f-date-date').value,
          title,
          description: document.getElementById('f-date-desc').value.trim(),
          emoji: selIcon ? selIcon.dataset.emoji : 'heart',
        };
      }
      case 'spot': {
        const name = document.getElementById('f-spot-name').value.trim();
        if (!name) { alert('Please add a name'); return null; }
        const selIcon = document.querySelector('#f-spot-emoji .icon-option.selected');
        return {
          name,
          address: document.getElementById('f-spot-address').value.trim(),
          notes: document.getElementById('f-spot-notes').value.trim(),
          emoji: selIcon ? selIcon.dataset.emoji : 'map-pin',
        };
      }
      case 'food': {
        const name = document.getElementById('f-food-name').value.trim();
        if (!name) { alert('Please add a name'); return null; }
        const selIcon = document.querySelector('#f-food-emoji .icon-option.selected');
        const hearts = document.querySelectorAll('#f-food-rating .rating-heart-btn');
        let rating = 0;
        hearts.forEach((b) => {
          const icon = b.querySelector('.rating-heart-icon');
          if (icon && icon.classList.contains('filled')) rating = parseInt(b.dataset.val);
        });
        return {
          name,
          notes: document.getElementById('f-food-notes').value.trim(),
          rating,
          emoji: selIcon ? selIcon.dataset.emoji : 'utensils-crossed',
        };
      }
      case 'letter': {
        const title = document.getElementById('f-letter-title').value.trim();
        const content = document.getElementById('f-letter-content').value.trim();
        if (!content) { alert('Please write your letter'); return null; }
        return { title: title || 'Untitled', content };
      }
      case 'memory': {
        const title = document.getElementById('f-memory-title').value.trim();
        if (!title) { alert('Please add a title'); return null; }
        return {
          title,
          date: document.getElementById('f-memory-date').value,
          description: document.getElementById('f-memory-desc').value.trim(),
        };
      }
      case 'bucketlist': {
        const title = document.getElementById('f-bucket-title').value.trim();
        if (!title) { alert('Please add a list title'); return null; }
        const rows = document.querySelectorAll('#f-bucket-rows .bucket-row');
        const items = [];
        rows.forEach((row) => {
          const text = row.querySelector('.f-bucket-text').value.trim();
          const checked = row.querySelector('.f-bucket-check').checked;
          items.push({
            id: row.dataset.entryId || uid(),
            text: text || 'Unnamed item',
            checked,
          });
        });
        if (items.length === 0) { alert('Add at least one item'); return null; }
        return { title, items };
      }
      case 'quote': {
        const quote = document.getElementById('f-quote-text').value.trim();
        if (!quote) { alert('Please write a quote'); return null; }
        return {
          quote,
          attribution: document.getElementById('f-quote-attribution').value.trim(),
        };
      }
      default: return null;
    }
  }

  // ── Keyboard Shortcuts ─────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!confirmOverlay.classList.contains('hidden')) {
        pendingDeleteId = null;
        confirmOverlay.classList.add('hidden');
      } else if (!modalOverlay.classList.contains('hidden')) {
        closeModal();
      }
    }
  });

  // ── Welcome Items ──────────────────────────────────────
  function addWelcomeItems() {
    state.items.push({
      id: uid(),
      type: 'sticky',
      x: -90,
      y: -120,
      rotation: -2.5,
      zIndex: state.nextZ++,
      data: {
        text: 'Welcome to Our World! ♥\n\nDrag me around, add photos, notes, and memories. This is your space!',
        colorClass: 'sticky-rose',
      },
    });
    state.items.push({
      id: uid(),
      type: 'memory',
      x: 150,
      y: -80,
      rotation: 1.8,
      zIndex: state.nextZ++,
      data: {
        title: 'The Beginning',
        date: '',
        description: 'Every love story is beautiful, but ours is my favorite.',
      },
    });
    state.items.push({
      id: uid(),
      type: 'letter',
      x: -140,
      y: 120,
      rotation: 0.7,
      zIndex: state.nextZ++,
      data: {
        title: 'To Us',
        content: 'This little corner of the internet is just for us. Fill it with everything that makes our world special.',
      },
    });
  }

  // ── Collaborate (real-time sync) ────────────────────────
  const collabPanel = document.getElementById('collab-panel');
  const collabRoomInput = document.getElementById('collab-room-input');
  const collabJoinBtn = document.getElementById('collab-join');
  const collabCreateBtn = document.getElementById('collab-create');
  const collabStatus = document.getElementById('collab-status');
  const collabCloseBtn = document.getElementById('collab-close');

  function showCollabStatus(msg, isError) {
    if (!collabStatus) return;
    collabStatus.textContent = msg;
    collabStatus.classList.remove('hidden', 'connected', 'error');
    collabStatus.classList.add(isError ? 'error' : 'connected');
  }

  function hideCollabStatus() {
    if (collabStatus) collabStatus.classList.add('hidden');
  }

  /** Connect to sync room so data is saved/loaded from server (same on all devices with same password). */
  function connectSync(syncRoomId) {
    const url = getSocketUrl();
    if (!url || typeof io === 'undefined') return;
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
      socket = null;
    }
    socket = io(url, { transports: ['websocket', 'polling'] });
    currentRoomId = syncRoomId;
    let receivedStateFromServer = false;

    socket.on('connect', function () {
      socket.emit('join', syncRoomId);
      setTimeout(function () {
        if (!receivedStateFromServer) socket.emit('state', getState());
      }, 400);
    });

    socket.on('state', function (payload) {
      receivedStateFromServer = true;
      setState(payload);
      renderAll();
      applyTransform();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    });

    socket.on('disconnect', function () {});
    socket.on('connect_error', function () {});
  }

  function connectToRoom(roomId, isCreator) {
    const url = getSocketUrl();
    if (typeof io === 'undefined') {
      showCollabStatus('Socket.io not loaded. Open the app from http://localhost:3001 (run: npm run server)', true);
      return;
    }
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
      socket = null;
    }
    socket = io(url, { transports: ['websocket', 'polling'] });
    currentRoomId = roomId;

    socket.on('connect', function () {
      socket.emit('join', roomId);
      if (isCreator) {
        socket.emit('state', getState());
      }
      showCollabStatus('Connected! Share the room code: ' + roomId);
    });

    socket.on('state', function (payload) {
      setState(payload);
      renderAll();
      applyTransform();
    });

    socket.on('disconnect', function () {
      showCollabStatus('Disconnected.', true);
    });

    socket.on('connect_error', function () {
      showCollabStatus('Could not connect. Is the server running? (npm run server)', true);
    });
  }

  function randomRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  document.getElementById('btn-collab').addEventListener('click', () => {
    collabPanel.classList.remove('hidden');
    hideCollabStatus();
    refreshIcons();
  });

  collabCloseBtn.addEventListener('click', () => {
    collabPanel.classList.add('hidden');
  });

  collabPanel.addEventListener('click', (e) => {
    if (e.target === collabPanel) collabPanel.classList.add('hidden');
  });

  collabJoinBtn.addEventListener('click', () => {
    const room = (collabRoomInput.value || '').trim().toUpperCase().slice(0, 12);
    if (!room) {
      showCollabStatus('Enter a room code', true);
      return;
    }
    connectToRoom(room, false);
  });

  collabCreateBtn.addEventListener('click', () => {
    const room = randomRoomCode();
    collabRoomInput.value = room;
    connectToRoom(room, true);
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      const link = window.location.origin + window.location.pathname + '?room=' + room;
      navigator.clipboard.writeText(link).catch(() => {});
    }
  });

  // ── Init ───────────────────────────────────────────────
  function init() {
    load();
    if (state.items.length === 0) {
      addWelcomeItems();
      const rect = viewport.getBoundingClientRect();
      state.panX = rect.width / 2;
      state.panY = rect.height / 2;
    }
    renderAll();
    save();

    var syncRoomId = typeof localStorage !== 'undefined' ? localStorage.getItem(SYNC_ROOM_KEY) : null;
    if (syncRoomId && getSocketUrl()) connectSync(syncRoomId);

    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const roomFromUrl = params.get('room');
    if (roomFromUrl && collabRoomInput) {
      collabRoomInput.value = roomFromUrl.trim().toUpperCase().slice(0, 12);
      collabPanel.classList.remove('hidden');
    }
    refreshIcons();
  }

  if (typeof localStorage !== 'undefined' && localStorage.getItem(UNLOCK_KEY) === '1') {
    init();
  } else {
    document.body.classList.add('locked');
    var form = document.getElementById('password-form');
    var input = document.getElementById('password-input');
    var err = document.getElementById('password-error');
    if (form && input) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (input.value.trim() === GATE_PASSWORD) {
          hashPassword(input.value).then(function (syncRoomId) {
            try { localStorage.setItem(SYNC_ROOM_KEY, syncRoomId); } catch (e) {}
            localStorage.setItem(UNLOCK_KEY, '1');
            document.body.classList.remove('locked');
            if (err) { err.textContent = ''; err.classList.add('hidden'); }
            init();
          });
        } else {
          if (err) {
            err.textContent = 'Incorrect';
            err.classList.remove('hidden');
          }
          input.value = '';
          input.focus();
        }
      });
    }
  }
})();
