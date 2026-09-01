let rows = [];
let selectedCity = 'all';
const map = L.map('restaurantMap', {preferCanvas: true}).setView([24.79, 121.03], 11);
const markerLayer = L.layerGroup().addTo(map);
const markerByRestaurant = new Map();

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value == null ? '' : String(value);
  return node.innerHTML;
}

function searchText(row) {
  return [row.name, row.address, row.city, row.district].filter(Boolean).join(' ').toLocaleLowerCase('zh-Hant');
}

function visibleRows() {
  const query = document.querySelector('#mapSearch').value.trim().toLocaleLowerCase('zh-Hant');
  return rows.filter(row =>
    (selectedCity === 'all' || row.city === selectedCity) && (!query || searchText(row).includes(query))
  );
}

function popupHtml(group) {
  return `<div class="food-popup">${group.map(row => {
    const reviews = Number(row.reviews || 0).toLocaleString();
    const rating = row.rating == null ? '尚無評分' : `★ ${Number(row.rating).toFixed(1)}（${reviews} 則）`;
    return `<article>
      <h3>${escapeHtml(row.name)}</h3>
      <p>${escapeHtml(row.address)}</p>
      <p class="rating">${escapeHtml(rating)}</p>
      <p>每人約 ${escapeHtml(row.price || '未提供')}</p>
      ${row.maps_url ? `<a href="${escapeHtml(row.maps_url)}" target="_blank" rel="noreferrer">Google Maps ↗</a>` : ''}
      ${row.instagram_url ? `<a href="${escapeHtml(row.instagram_url)}" target="_blank" rel="noreferrer">Instagram ↗</a>` : ''}
    </article>`;
  }).join('')}</div>`;
}

function markerIcon(group) {
  const county = group.every(row => row.city === '新竹縣') ? ' county' : '';
  const label = group.length > 1 ? group.length : '●';
  return L.divIcon({
    className: 'food-map-icon',
    html: `<div class="food-pin${county}"><span>${label}</span></div>`,
    iconSize: [34, 34], iconAnchor: [17, 31], popupAnchor: [0, -29],
  });
}

function renderList(items) {
  const list = document.querySelector('#restaurantList');
  list.replaceChildren();
  if (!items.length) {
    list.innerHTML = '<p class="empty">找不到符合條件的店家。</p>';
    return;
  }
  items.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')).forEach(row => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'restaurant-item';
    button.innerHTML = `<strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.address)}</span><span class="meta">${row.rating == null ? '—' : `★ ${Number(row.rating).toFixed(1)}`} · 每人約 ${escapeHtml(row.price || '—')}</span>`;
    button.addEventListener('click', () => {
      const marker = markerByRestaurant.get(row.id);
      if (marker) {
        map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), {duration: .65});
        marker.openPopup();
        document.querySelector('#restaurantMap').scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    });
    list.append(button);
  });
}

function renderMap() {
  const items = visibleRows();
  markerLayer.clearLayers();
  markerByRestaurant.clear();
  const groups = new Map();
  items.forEach(row => {
    const key = `${Number(row.latitude).toFixed(5)},${Number(row.longitude).toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const markers = [];
  groups.forEach(group => {
    const marker = L.marker([group[0].latitude, group[0].longitude], {icon: markerIcon(group)})
      .bindPopup(popupHtml(group), {maxWidth: 350})
      .bindTooltip(group.length === 1 ? group[0].name : `${group.length} 家店`, {direction: 'top', offset: [0, -26]})
      .addTo(markerLayer);
    markers.push(marker);
    group.forEach(row => markerByRestaurant.set(row.id, marker));
  });
  document.querySelector('#resultCount').textContent = `${items.length} 家 · ${groups.size} 個位置`;
  renderList(items);
  if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(.08), {maxZoom: 16});
}

document.querySelectorAll('[data-city]').forEach(button => {
  button.addEventListener('click', () => {
    selectedCity = button.dataset.city;
    document.querySelectorAll('[data-city]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderMap();
  });
});
document.querySelector('#mapSearch').addEventListener('input', renderMap);

const shareButton = document.querySelector('#shareMap');
if (navigator.share) {
  shareButton.hidden = false;
  shareButton.addEventListener('click', () => navigator.share({title: document.title, url: location.href}));
}

fetch('./data.json')
  .then(response => {
    if (!response.ok) throw new Error('資料載入失敗');
    return response.json();
  })
  .then(data => {
    rows = data.restaurants;
    const positions = new Set(rows.map(row => `${Number(row.latitude).toFixed(5)},${Number(row.longitude).toFixed(5)}`));
    document.querySelector('#restaurantTotal').textContent = rows.length;
    document.querySelector('#positionTotal').textContent = `${positions.size} 個位置 · ${data.updated_at}`;
    renderMap();
  })
  .catch(error => {
    document.querySelector('#restaurantList').innerHTML = `<p class="empty">${escapeHtml(error.message)}，請稍後再試。</p>`;
    document.querySelector('#resultCount').textContent = '載入失敗';
  });
