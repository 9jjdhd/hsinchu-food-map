let rows = [];
let selectedCity = 'all';
let selectedPrice = 'all';
let locationGroups = [];
let listLimit = 50;
let searchTimer;

const map = L.map('restaurantMap', {preferCanvas: true, zoomControl: true}).setView([24.79, 121.03], 11);
const markerLayer = L.layerGroup().addTo(map);
const markerByRestaurant = new Map();
const canvasRenderer = L.canvas({padding: .35, tolerance: 8});

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  updateWhenIdle: true,
  keepBuffer: 2,
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

function priceTier(row) {
  const values = String(row.price || '')
    .replaceAll(',', '')
    .match(/\d+/g)
    ?.map(Number) || [];
  if (!values.length) return 'unknown';
  const average = values.length === 1 ? values[0] : (values[0] + values[1]) / 2;
  if (average <= 400) return 'budget';
  if (average <= 800) return 'mid';
  return 'premium';
}

function priceTierLabel(row) {
  return {budget: '平價', mid: '中等', premium: '高價'}[priceTier(row)] || '價位未定';
}

function visibleRows() {
  const query = document.querySelector('#mapSearch').value.trim().toLocaleLowerCase('zh-Hant');
  return rows.filter(row =>
    (selectedCity === 'all' || row.city === selectedCity) &&
    (selectedPrice === 'all' || priceTier(row) === selectedPrice) &&
    (!query || searchText(row).includes(query))
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
      <p><span class="price-tier ${priceTier(row)}">${priceTierLabel(row)}</span> 每人約 ${escapeHtml(row.price || '未提供')}</p>
      ${row.maps_url ? `<a href="${escapeHtml(row.maps_url)}" target="_blank" rel="noreferrer">Google Maps ↗</a>` : ''}
      ${row.instagram_url ? `<a href="${escapeHtml(row.instagram_url)}" target="_blank" rel="noreferrer">Instagram ↗</a>` : ''}
    </article>`;
  }).join('')}</div>`;
}

function buildLocationGroups() {
  const grouped = new Map();
  rows.forEach(row => {
    const key = `${Number(row.latitude).toFixed(5)},${Number(row.longitude).toFixed(5)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  locationGroups = Array.from(grouped.values()).map(group => {
    const county = group.every(row => row.city === '新竹縣');
    const marker = L.circleMarker([group[0].latitude, group[0].longitude], {
      renderer: canvasRenderer,
      radius: group.length > 1 ? 9 : 7,
      color: '#fffdf7',
      weight: 2,
      fillColor: county ? '#d97837' : '#1f6757',
      fillOpacity: .94,
      opacity: 1,
    }).bindTooltip(group.length === 1 ? group[0].name : `${group.length} 家店`, {
      direction: 'top', offset: [0, -8],
    }).bindPopup(popupHtml(group), {maxWidth: 350});
    group.forEach(row => markerByRestaurant.set(row.id, marker));
    return {rows: group, marker};
  });
}

function renderList(items) {
  const list = document.querySelector('#restaurantList');
  list.replaceChildren();
  if (!items.length) {
    list.innerHTML = '<p class="empty">找不到符合條件的店家。</p>';
    return;
  }

  const sorted = items.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const fragment = document.createDocumentFragment();
  sorted.slice(0, listLimit).forEach(row => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'restaurant-item';
    button.innerHTML = `<strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.address)}</span><span class="meta"><b class="price-tier ${priceTier(row)}">${priceTierLabel(row)}</b>${row.rating == null ? '—' : `★ ${Number(row.rating).toFixed(1)}`} · 每人約 ${escapeHtml(row.price || '—')}</span>`;
    button.addEventListener('click', () => {
      const marker = markerByRestaurant.get(row.id);
      if (!marker) return;
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 16), {duration: .45});
      marker.openPopup();
      if (matchMedia('(max-width: 820px)').matches) {
        document.querySelector('#restaurantMap').scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    });
    fragment.append(button);
  });
  list.append(fragment);

  if (sorted.length > listLimit) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'load-more';
    more.textContent = `再顯示 ${Math.min(50, sorted.length - listLimit)} 家`;
    more.addEventListener('click', () => {
      listLimit += 50;
      renderList(items);
    });
    list.append(more);
  }
}

function renderMap({fit = false} = {}) {
  const items = visibleRows();
  const visibleIds = new Set(items.map(row => row.id));
  const markers = [];
  markerLayer.clearLayers();

  locationGroups.forEach(location => {
    const matched = location.rows.filter(row => visibleIds.has(row.id));
    if (!matched.length) return;
    location.marker.setPopupContent(popupHtml(matched));
    location.marker.addTo(markerLayer);
    markers.push(location.marker);
  });

  document.querySelector('#resultCount').textContent = `${items.length} 家 · ${markers.length} 個位置`;
  renderList(items);
  if (fit && markers.length) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(.08), {maxZoom: 16, animate: false});
  }
}

document.querySelectorAll('[data-city]').forEach(button => {
  button.addEventListener('click', () => {
    selectedCity = button.dataset.city;
    document.querySelectorAll('[data-city]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    listLimit = 50;
    renderMap({fit: true});
  });
});

document.querySelector('#mapSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    listLimit = 50;
    renderMap();
  }, 160);
});

document.querySelector('#priceFilter').addEventListener('change', event => {
  selectedPrice = event.target.value;
  listLimit = 50;
  renderMap({fit: true});
});

document.querySelector('#resetView').addEventListener('click', () => renderMap({fit: true}));

const listPanel = document.querySelector('#restaurantPanel');
const listToggle = document.querySelector('#toggleList');
listToggle.addEventListener('click', () => {
  const open = listPanel.classList.toggle('open');
  listToggle.setAttribute('aria-expanded', String(open));
  listToggle.textContent = open ? '收起清單' : '查看清單';
  if (open) listPanel.scrollIntoView({behavior: 'smooth', block: 'nearest'});
});

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
    const tierCounts = rows.reduce((counts, row) => {
      const tier = priceTier(row);
      counts[tier] = (counts[tier] || 0) + 1;
      return counts;
    }, {});
    const tierLabels = {budget: '平價 · $400 以下', mid: '中等 · $401–800', premium: '高價 · $801 以上'};
    Object.entries(tierLabels).forEach(([tier, label]) => {
      const option = document.querySelector(`#priceFilter option[value="${tier}"]`);
      option.textContent = `${label}（${tierCounts[tier] || 0}）`;
    });
    buildLocationGroups();
    document.querySelector('#restaurantTotal').textContent = rows.length;
    document.querySelector('#positionTotal').textContent = `${locationGroups.length} 個位置 · ${data.updated_at}`;
    renderMap({fit: true});
    document.querySelector('#mapLoading').classList.add('hidden');
  })
  .catch(error => {
    document.querySelector('#mapLoading').classList.add('hidden');
    document.querySelector('#restaurantList').innerHTML = `<p class="empty">${escapeHtml(error.message)}，請稍後再試。</p>`;
    document.querySelector('#resultCount').textContent = '載入失敗';
  });
