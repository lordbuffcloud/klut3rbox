async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function toast(message, type = 'success', timeoutMs = 2500) {
  const cont = document.getElementById('toastContainer');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  cont.appendChild(el);
  setTimeout(() => { el.remove(); }, timeoutMs);
}

function lazyImg(src, alt) {
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = src; // keep simple; modern browsers handle lazy with loading attr
  img.alt = alt || '';
  return img;
}

function itemCard(item) {
  const container = document.createElement('div');
  container.className = 'item-card';
  if (item.image_path) {
    const img = lazyImg(item.image_path, item.name);
    container.appendChild(img);
  }
  const title = document.createElement('h3');
  title.textContent = item.name;
  container.appendChild(title);
  const meta = document.createElement('p');
  meta.textContent = `Box: ${item.box_code}`;
  container.appendChild(meta);
  if (item.description) {
    const desc = document.createElement('p');
    desc.textContent = item.description;
    container.appendChild(desc);
  }
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  const edit = document.createElement('button');
  edit.textContent = 'Edit';
  edit.onclick = () => openEditModal(item);
  actions.appendChild(edit);
  const del = document.createElement('button');
  del.textContent = 'Delete';
  del.style.background = '#ef4444';
  del.style.color = '#111827';
  del.onclick = async () => {
    if (!confirm('Delete this item?')) return;
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      await refreshItems();
    } catch (err) {
      toast('Failed to delete item', 'error');
    }
  };
  actions.appendChild(del);
  container.appendChild(actions);
  return container;
}

async function refreshItems() {
  const itemsDiv = document.getElementById('items');
  itemsDiv.innerHTML = '';
  try {
    const boxSelect = document.getElementById('searchBoxSelect');
    const box_code = boxSelect && boxSelect.value ? boxSelect.value : '';
    const url = box_code ? `/api/items?limit=50&box_code=${encodeURIComponent(box_code)}` : '/api/items?limit=50';
    const items = await getJSON(url);
    items.forEach((it) => itemsDiv.appendChild(itemCard(it)));
  } catch (err) {
    itemsDiv.textContent = 'Failed to load items';
  }
}

async function checkHealth() {
  try {
    await getJSON('/api/health');
    document.getElementById('statusText').textContent = 'Ready';
  } catch (err) {
    document.getElementById('statusText').textContent = 'Server unavailable';
    toast('Server unavailable', 'error');
  }
}

function wireAddItemForm() {
  const form = document.getElementById('addItemForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('itemName').value.trim();
    const description = document.getElementById('itemDesc').value.trim();
    const manualSel = document.getElementById('manualBoxSelect');
    const box_code = (manualSel && manualSel.value) ? manualSel.value : 'box1';
    if (!name) return;
    try {
      await getJSON('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined, box_code }),
      });
      form.reset();
      await refreshItems();
    } catch (err) {
      toast('Failed to add item', 'error');
    }
  });
}

function wireSearch() {
  const input = document.getElementById('searchInput');
  const btn = document.getElementById('searchBtn');
  const boxSel = document.getElementById('searchBoxSelect');
  const itemsDiv = document.getElementById('items');
  const exportBtn = document.getElementById('exportBtn');
  async function run() {
    const q = input.value.trim();
    const box_code = boxSel && boxSel.value ? boxSel.value : '';
    if (!q && !box_code) return refreshItems();
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (boxSel && boxSel.value) {
        const selected = boxSel.value;
        if (selected) qs.set('box_code', selected);
      }
      const items = await getJSON(`/api/search?${qs.toString()}`);
      itemsDiv.innerHTML = '';
      items.forEach((it) => itemsDiv.appendChild(itemCard(it)));
    } catch (err) {
      itemsDiv.textContent = 'Search failed';
      toast('Search failed', 'error');
    }
  }
  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });
  if (boxSel) {
    boxSel.addEventListener('change', () => {
      if (!input.value.trim()) refreshItems();
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      window.location.href = '/api/export?download=1';
    });
  }
}

async function refreshBoxes() {
  const grid = document.getElementById('boxGrid');
  const quickSel = document.getElementById('quickBoxSelect');
  const manualSel = document.getElementById('manualBoxSelect');
  const searchSel = document.getElementById('searchBoxSelect');
  if (grid) grid.innerHTML = '';
  if (quickSel) quickSel.innerHTML = '';
  if (manualSel) manualSel.innerHTML = '';
  if (searchSel) {
    searchSel.innerHTML = '';
    const anyOpt = document.createElement('option');
    anyOpt.value = '';
    anyOpt.textContent = 'All boxes';
    anyOpt.selected = true;
    searchSel.appendChild(anyOpt);
  }
  try {
    const boxes = await getJSON('/api/boxes/summary');
    for (const b of boxes) {
      if (grid) {
        const card = document.createElement('div');
        card.className = 'box-card';
        const h3 = document.createElement('h3');
        h3.textContent = b.label ? `${b.label} (${b.code})` : b.code;
        const p = document.createElement('p');
        p.textContent = `${b.item_count} items`;
        card.appendChild(h3);
        card.appendChild(p);
        card.onclick = async () => {
          if (searchSel) searchSel.value = b.code;
          await refreshItems();
        };
        grid.appendChild(card);
      }

      for (const sel of [quickSel, manualSel, searchSel]) {
        if (!sel) continue;
        const opt = document.createElement('option');
        opt.value = b.code;
        opt.textContent = b.label ? `${b.label} (${b.code})` : b.code;
        sel.appendChild(opt);
      }
    }
  } catch (err) {
    if (grid) grid.textContent = 'Failed to load boxes';
  }
}

function wireAddBoxForm() {
  const form = document.getElementById('addBoxForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('newBoxCode').value.trim();
    const label = document.getElementById('newBoxLabel').value.trim();
    if (!code) return;
    try {
      await getJSON('/api/boxes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, label: label || undefined }) });
      form.reset();
      await refreshBoxes();
    } catch (err) {
      toast('Failed to add box', 'error');
    }
  });
}

function wireQuickAdd() {
  const btn = document.getElementById('quickAddBtn');
  const input = document.getElementById('quickFile');
  const boxSel = document.getElementById('quickBoxSelect');
  const panel = document.getElementById('suggestPanel');
  const img = document.getElementById('suggestImage');
  const nameEl = document.getElementById('suggestName');
  const descEl = document.getElementById('suggestDesc');
  const suggestBox = document.getElementById('suggestBoxSelect');
  const confirmBtn = document.getElementById('suggestConfirm');
  const cancelBtn = document.getElementById('suggestCancel');
  let lastSuggested = null; // { items: [...], image_path, box_code }
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const file = input && input.files && input.files[0];
    if (!file) return alert('Choose an image');
    try {
      // Ask server to suggest details using vision without saving
      const form = new FormData();
      form.append('image', file, 'img.jpg');
      const preferred = boxSel && boxSel.value ? boxSel.value : 'box1';
      form.append('box_code', preferred);
      const res = await fetch('/api/vision-suggest', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      lastSuggested = data;
      // Show panel to edit/confirm
      if (panel && img && nameEl && descEl && suggestBox) {
        img.src = data.image_path;
        const first = (data.items && data.items[0]) || { name: '', description: '' };
        nameEl.value = first.name || '';
        descEl.value = first.description || '';
        suggestBox.innerHTML = '';
        // clone options from quick box select
        if (boxSel) {
          for (const opt of boxSel.options) {
            const o = document.createElement('option');
            o.value = opt.value; o.textContent = opt.textContent;
            if (opt.value === (data.box_code || preferred)) o.selected = true;
            suggestBox.appendChild(o);
          }
        }
        panel.style.display = '';
      }
      // Wire confirm/cancel
      confirmBtn.onclick = async () => {
        try {
          const baseBox = suggestBox.value || preferred;
          const edited = [];
          // Use first inputs as template for first item, others keep suggested
          if (lastSuggested && Array.isArray(lastSuggested.items)) {
            const arr = lastSuggested.items;
            for (let i = 0; i < arr.length; i++) {
              const it = arr[i];
              if (i === 0) {
                const nm = nameEl.value.trim();
                if (!nm) return alert('Name required');
                edited.push({ name: nm, description: (descEl.value.trim() || undefined), image_path: lastSuggested.image_path, box_code: baseBox });
              } else {
                edited.push({ name: (it.name || '').trim(), description: (it.description || '').trim() || undefined, image_path: lastSuggested.image_path, box_code: baseBox });
              }
            }
          }
          await getJSON('/api/items/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: edited }) });
          panel.style.display = 'none';
          input.value = '';
          await refreshItems();
        } catch (e) {
          alert('Failed to save item');
        }
      };
      cancelBtn.onclick = () => { panel.style.display = 'none'; };
    } catch (err) {
      toast('Quick add failed', 'error');
    }
  });
}

async function uploadQuickAdd(blob, box_code) {
  const form = new FormData();
  form.append('image', blob, 'capture.jpg');
  if (box_code) form.append('box_code', box_code);
  const res = await fetch('/api/quick-add', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  await res.json();
  await refreshItems();
}

window.addEventListener('DOMContentLoaded', async () => {
  await checkHealth();
  wireAddBoxForm();
  wireAddItemForm();
  wireSearch();
  wireQuickAdd();
  wireBottomNav();
  wireFab();
  wireEditModal();
  await refreshBoxes();
  await refreshItems();
});

function wireBottomNav() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-target]');
    if (!btn) return;
    const target = document.querySelector(btn.getAttribute('data-target'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function wireFab() {
  const fab = document.getElementById('fabAdd');
  const quick = document.getElementById('quick-add');
  if (!fab || !quick) return;
  fab.addEventListener('click', () => quick.scrollIntoView({ behavior: 'smooth' }));
}

function openEditModal(item) {
  const modal = document.getElementById('editModal');
  const idEl = document.getElementById('editId');
  const nameEl = document.getElementById('editName');
  const descEl = document.getElementById('editDesc');
  const boxEl = document.getElementById('editBox');
  if (!modal || !idEl || !nameEl) return;
  idEl.value = String(item.id);
  nameEl.value = item.name || '';
  descEl.value = item.description || '';
  boxEl.value = item.box_code || '';
  modal.style.display = '';
}

function wireEditModal() {
  const modal = document.getElementById('editModal');
  const form = document.getElementById('editForm');
  const cancel = document.getElementById('editCancel');
  if (!modal || !form || !cancel) return;
  cancel.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById('editId').value);
    const name = document.getElementById('editName').value.trim();
    const description = document.getElementById('editDesc').value.trim();
    const box_code = document.getElementById('editBox').value.trim();
    if (!id || !name) return;
    try {
      const body = { name };
      if (description || description === '') body.description = description;
      if (box_code) body.box_code = box_code;
      await getJSON(`/api/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      modal.style.display = 'none';
      toast('Item updated');
      await refreshItems();
      await refreshBoxes();
    } catch (_) {
      toast('Failed to update item', 'error');
    }
  });
}


