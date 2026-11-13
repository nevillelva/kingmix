// web/ui/render-facility.js：營造面板。顯示御花園、太醫院、翰林院之等級、下一級費用與效果，並可升級。
import { FACILITIES, FACILITY_IDS, FACILITY_MAX_LEVEL, facilityLevels, upgradeFacility } from '../../src/facilities.js';
import { STAT } from './labels.js';
import { U, app } from './store.js';
import { save } from './state-io.js';
import { render } from './render-nav.js';
import { esc } from './util.js';

const ERR_TEXT = {
  insufficient_treasury: '國庫不足，無法營造。',
  max_level: '此設施已至最高級。',
  unknown_facility: '查無此設施。',
};

// 效果文字：目前等級的每月加成，以及下一級的每月加成。
function effectText(def, level){
  const label = STAT[def.stat].l;
  const cur = level > 0 ? `目前每月 ${label} +${def.levels[level - 1].monthly}` : '目前尚無效果';
  const next = level < FACILITY_MAX_LEVEL ? `下一級每月 ${label} +${def.levels[level].monthly}` : '已達最高級';
  return { cur, next };
}

export function renderFacility(){
  const levels = facilityLevels(U.state);
  const treasury = Math.round(U.state.stats.treasury);
  const cards = FACILITY_IDS.map(id => {
    const def = FACILITIES[id];
    const level = levels[id];
    const { cur, next } = effectText(def, level);
    const maxed = level >= FACILITY_MAX_LEVEL;
    const cost = maxed ? null : def.levels[level].cost;
    const can = !maxed && treasury >= cost;
    const btn = maxed
      ? '<button class="btn ghost" disabled>已至最高級</button>'
      : `<button class="btn zhu" data-facility="${id}"${can ? '' : ' disabled'}>升級（國庫 ${cost}）</button>`;
    return `<section class="card"><div class="kicker">${esc(def.name)}</div>
      <h2>${esc(def.name)}　第 ${level} 級 / ${FACILITY_MAX_LEVEL}</h2>
      <p class="sub">${esc(cur)}　${esc(next)}</p>
      <div style="margin-top:10px">${btn}</div>
    </section>`;
  }).join('');

  app.innerHTML = `
    <section class="card"><div class="kicker">營造</div><h2>宮內設施</h2>
      <p class="sub">國庫現有 ${treasury}。設施一經建成，每月為所屬屬性增益。</p>
      ${U.feedback ? `<p class="sub" role="status" style="color:var(--vermilion)">${esc(U.feedback)}</p>` : ''}
    </section>
    ${cards}`;

  app.querySelectorAll('[data-facility]').forEach(b => b.onclick = () => {
    const res = upgradeFacility(U.state, b.dataset.facility);
    if (res.error) { U.feedback = ERR_TEXT[res.error] ?? '無法營造。'; return render(); }
    U.state = res;
    U.feedback = `${FACILITIES[b.dataset.facility].name}已升至第 ${res.facilities[b.dataset.facility]} 級。`;
    save();
    render();
  });
}
