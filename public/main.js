async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function itemCard(item) {
  const container = document.createElement('div');
  container.className = 'item-card';
  if (item.image_path) {
    const img = document.createElement('img');
    img.src = item.image_path;
    img.alt = item.name;
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
  edit.onclick = async () => {
    const newName = prompt('Edit name', item.name);
    if (newName === null) return; // cancel
    const newDesc = prompt('Edit description (optional)', item.description || '');
    let newBox = prompt('Move to box code (leave blank to keep current)', '');
    if (newBox !== null) newBox = newBox.trim();
    try {
      const body = { name: newName.trim() };
      if (newDesc !== null) body.description = newDesc.trim();
      if (newBox) body.box_code = newBox;
      await getJSON(`/api/items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await refreshItems();
      await refreshBoxes();
    } catch (e) {
      alert('Failed to update item');
    }
  };
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
      alert('Failed to delete item');
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
      alert('Failed to add item');
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
      alert('Failed to add box');
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
      alert('Quick add failed');
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
  await refreshBoxes();
  await refreshItems();
});


