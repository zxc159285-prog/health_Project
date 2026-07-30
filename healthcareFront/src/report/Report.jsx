import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import NavIcon from '../components/uiIcons.jsx';
import './Report.css';

// 이탈 요인 표시 고정 순서 (이 순서대로 위→아래로 노출, 목록에 없는 요인은 뒤로)
const FACTOR_ORDER = [
  '나이',
  '이번달_주당방문횟수',
  '총_이용개월수',
  '상대_방문공백',
  '일평균_운동시간',
  '주_이용_시간대_혼잡도',
  '그룹수업_참여',
  'PT_가입여부',
  '최근한달_부상경험',
  '서비스불만_환경불편',
  '서비스불만_비매너회원',
  '기구불만_기구부족',
  '기구불만_기구상태불만',
  '직원불만_불친절',
  '직원불만_전문성부족',
  '가격불만',
];

// 모델 피처키(statKey) → 사용자용 자연어 라벨 (표시 전용, 매칭 로직은 원래 키 그대로 사용)
const FACTOR_LABEL = {
  '나이': '나이',
  '이번달_주당방문횟수': '주당 방문 감소',
  '총_이용개월수': '이용 기간',
  '상대_방문공백': '방문 공백',
  '일평균_운동시간': '운동시간 저조',
  '주_이용_시간대_혼잡도': '시간대 혼잡',
  '그룹수업_참여': '그룹수업 미참여',
  'PT_가입여부': 'PT 미가입',
  '최근한달_부상경험': '최근 부상',
  '서비스불만_환경불편': '환경 불편',
  '서비스불만_비매너회원': '비매너 회원',
  '기구불만_기구부족': '기구 부족',
  '기구불만_기구상태불만': '기구 상태 불만',
  '직원불만_불친절': '직원 불친절',
  '직원불만_전문성부족': '전문성 부족',
  '가격불만': '가격 불만',
};
const factorLabel = (k) => FACTOR_LABEL[k] || String(k || '').replace(/_/g, ' ');

// 불만족 요인별 액션 버튼 라벨
const FACTOR_ACTION = {
  '서비스불만_환경불편': '헬퍼 요청',
  '직원불만_불친절': '교육 프로그램 제공',
  '가격불만': '할인 쿠폰 발행',
  'PT_가입여부': 'PT 체험권 보내기',
  '최근한달_부상경험': 'PT 체험권 보내기',
  '일평균_운동시간': '목표 알림 발송',
};

// 이 요인은 버튼 대신 '그 요인을 가진 회원들의 방문 시간대 분포'를 옆에 띄운다
const VISIT_TIME_FACTOR = '서비스불만_비매너회원';
// 이 요인은 버튼 대신 '그 헬스장 기구 목록'을 옆에 띄운다
const EQUIP_FACTOR = '기구불만_기구부족';
// 이 요인은 버튼 대신 '그 요인을 가진 회원들의 담당자(계약 manager_id)'를 옆에 띄운다
const MANAGER_FACTOR = '직원불만_전문성부족';
// 이 요인은 버튼 대신 '서비스센터 전체 목록'을 옆에 띄운다
const SERVICE_CENTER_FACTOR = '기구불만_기구상태불만';
// 이 요인의 버튼을 누르면 프로모션(쿠폰 발행) 페이지로 이동
const COUPON_FACTOR = '가격불만';
// 이 요인의 버튼(헬퍼)을 누르면 헬퍼 요청 팝업 → h_helper 등록
const HELPER_FACTOR = '서비스불만_환경불편';
// 이 요인들의 버튼(PT체험권 발송)을 누르면 쿠폰 발송 팝업 → 오늘자 위험군 회원에게 쿠폰 발송
const PT_TRIAL_FACTORS = ['PT_가입여부', '최근한달_부상경험'];
// 이 요인의 버튼(교육 프로그램)은 회원이 아니라 직원 대상 교육 프로그램을 제공한다
const TRAINING_FACTOR = '직원불만_불친절';
// 이 요인들은 조치 버튼/패널 없이 회원 리스트를 높이 가득 채워 보여준다 (나이는 하단 조언 문구도 추가)
const FILL_FACTORS = ['나이', '이번달_주당방문횟수', '총_이용개월수', '일평균_운동시간', '주_이용_시간대_혼잡도', '그룹수업_참여',
  'PT_가입여부', '최근한달_부상경험', '서비스불만_환경불편', '직원불만_불친절', '가격불만', '상대_방문공백'];

// 방문 시간대 표시 순서(시간순)
const SLOT_ORDER = ['새벽(00-06)', '오전(06-11)', '점심(11-14)', '오후(14-18)', '저녁(18-22)', '야간(22-24)'];

// 이탈률(0~1) → 위험 등급 (모델 tier_edges [25,45,65] 와 일치)
function tierOf(rate) {
  const s = (Number(rate) || 0) * 100;
  if (s < 25) return { label: '안정', cls: 'good' };
  if (s < 45) return { label: '관찰', cls: 'warn' };
  if (s < 65) return { label: '개입', cls: 'serious' };
  return { label: '긴급', cls: 'crit' };
}

// 달력 그리드 (일별 선택) — 날짜별 이탈 등급 점 표시
function CalendarGrid({ periods, value, onPick }) {
  const tierByDate = {};
  periods.forEach((p) => { tierByDate[p.period] = tierOf(p.avgChurnRate).cls; });
  const pad = (n) => String(n).padStart(2, '0');
  const initDate = value || periods[0]?.period || new Date().toISOString().slice(0, 10);
  const [ym, setYm] = useState(() => {
    const parts = String(initDate).split('-').map(Number);
    return { y: parts[0], m: parts[1] };
  });
  const firstDow = new Date(ym.y, ym.m - 1, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  const prevMonth = () => setYm((s) => (s.m === 1 ? { y: s.y - 1, m: 12 } : { y: s.y, m: s.m - 1 }));
  const nextMonth = () => setYm((s) => (s.m === 12 ? { y: s.y + 1, m: 1 } : { y: s.y, m: s.m + 1 }));

  return (
    <>
      <div className="cs-cal-head">
        <button type="button" onClick={prevMonth} aria-label="이전 달">‹</button>
        <span>{ym.y}년 {ym.m}월</span>
        <button type="button" onClick={nextMonth} aria-label="다음 달">›</button>
      </div>
      <div className="cs-cal-grid cs-cal-dow">
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
          <span key={d} className="cs-cal-dow-cell">{d}</span>
        ))}
      </div>
      <div className="cs-cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />;
          const ds = `${ym.y}-${pad(ym.m)}-${pad(d)}`;
          const cls = tierByDate[ds];
          const sel = value === ds;
          return (
            <button
              key={ds}
              type="button"
              className={`cs-cal-day${cls ? ' has-data' : ''}${sel ? ' is-sel' : ''}`}
              disabled={!cls}
              onClick={() => onPick(ds)}
            >
              {d}
              {cls && <i className={`cs-cal-dot cs-bg-${cls}`} />}
            </button>
          );
        })}
      </div>
    </>
  );
}

// 월 달력 (월별 선택) — 일별 달력처럼 연도를 넘기며 12개월 그리드로 선택
function MonthGrid({ periods, value, onPick }) {
  const tierByPeriod = {};
  periods.forEach((p) => { tierByPeriod[p.period] = tierOf(p.avgChurnRate).cls; });
  const pad = (n) => String(n).padStart(2, '0');
  const initYear = Number(String(value || periods[0]?.period || new Date().getFullYear()).slice(0, 4));
  const [year, setYear] = useState(initYear);

  return (
    <>
      <div className="cs-cal-head">
        <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="이전 해">‹</button>
        <span>{year}년</span>
        <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="다음 해">›</button>
      </div>
      <div className="cs-cal-grid cs-month-grid">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const ym = `${year}-${pad(m)}`;
          const cls = tierByPeriod[ym];
          const sel = value === ym;
          return (
            <button
              key={ym}
              type="button"
              className={`cs-cal-day cs-mcell${cls ? ' has-data' : ''}${sel ? ' is-sel' : ''}`}
              disabled={!cls}
              onClick={() => onPick(ym)}
            >
              {m}월
              {cls && <i className={`cs-cal-dot cs-bg-${cls}`} />}
            </button>
          );
        })}
      </div>
    </>
  );
}

// 기간(날짜/월) 선택 — 통제 영역의 명시적 컨트롤 (전체 회원 표시와 분리)
function PeriodPicker({ mode, periods, value, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const pick = (v) => { onPick(v); setOpen(false); };

  return (
    <div className="cs-periodpick" ref={ref}>
      <button type="button" className="cs-period-ctl" aria-expanded={open} title={mode === 'daily' ? '날짜 선택' : '월 선택'}
              onClick={() => setOpen((o) => !o)}>
        <span className="cs-period-cal" aria-hidden="true"><NavIcon id="calendar" size={16} /></span>
        <span className="cs-period-val cs-num">{value || (mode === 'daily' ? '날짜' : '월')}</span>
        <span className="cs-period-chev" aria-hidden="true">
          <NavIcon id="chevron" size={14} className="ui-icon ui-icon--down" />
        </span>
      </button>
      {open && (
        <div className="cs-period-pop">
          {mode === 'daily'
            ? <CalendarGrid periods={periods} value={value} onPick={pick} />
            : <MonthGrid periods={periods} value={value} onPick={pick} />}
        </div>
      )}
    </div>
  );
}

// 서비스불만_비매너회원 요인을 가진 위험군 회원들이 주로 언제 오는지 (방문 시간대 분포)
function VisitTimePanel({ gymId, mode, period, statKey }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!gymId || !period) { setSlots([]); return; }
    setLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/result/stats/helper/complaintVisitTimes`
      + `?gymId=${gymId}&mode=${mode}&period=${period}&statKey=${encodeURIComponent(statKey)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSlots(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('방문 시간대 조회 실패:', e); setSlots([]); })
      .finally(() => setLoading(false));
  }, [gymId, mode, period, statKey]);

  const sorted = [...slots].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const total = slots.reduce((s, x) => s + Number(x.cnt || 0), 0);
  const max = slots.reduce((m, x) => Math.max(m, Number(x.cnt || 0)), 0) || 1;
  const peak = slots.reduce((p, x) => (Number(x.cnt || 0) > Number(p?.cnt || 0) ? x : p), null);

  return (
    <div className="cs-side cs-side-vt">
      <h5><NavIcon id="clock" size={16} className="ui-icon" /> 이 회원들이 주로 오는 시간대</h5>
      {loading ? (
        <p className="cs-loading">불러오는 중…</p>
      ) : total === 0 ? (
        <p className="cs-empty">방문 기록이 없어요.</p>
      ) : (
        <>
          <p className="cs-hint cs-hint--spaced">
            총 <b>{total}</b>회 방문 · 피크 <b className="cs-accent">{peak?.slot}</b>
          </p>
          <div className="cs-side-body">
            <table>
              <tbody>
                {sorted.map((x) => {
                  const cnt = Number(x.cnt || 0);
                  return (
                    <tr key={x.slot}>
                      <td className="cs-slot-name">{x.slot}</td>
                      <td className="cs-slot-cell">
                        <div className="cs-slotbar"><i style={{ width: `${(cnt / max) * 100}%` }} /></div>
                      </td>
                      <td className="r cs-num">{cnt}회</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// 기구불만_기구부족 요인일 때 옆에 띄우는 그 헬스장 기구 목록
function EquipmentPanel({ gymId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/fitb/itempage/byCategory`
      + `?gymId=${gymId}&category=${encodeURIComponent('기구')}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('기구 목록 조회 실패:', e); setItems([]); })
      .finally(() => setLoading(false));
  }, [gymId]);

  const sorted = [...items].sort((a, b) => Number(b.itemCount || 0) - Number(a.itemCount || 0));

  return (
    <div className="cs-side cs-side-eq">
      <h5><NavIcon id="dumbbell" size={16} className="ui-icon" /> 이 헬스장 기구 목록</h5>
      {loading ? (
        <p className="cs-loading">불러오는 중…</p>
      ) : sorted.length === 0 ? (
        <p className="cs-empty">등록된 기구가 없어요.</p>
      ) : (
        <div className="cs-side-body">
          <table>
            <thead><tr><th className="cs-eq-name">기구명</th><th className="r">보유 수량</th></tr></thead>
            <tbody>
              {sorted.map((it) => (
                <tr key={it.itemName}>
                  <td className="cs-eq-name">{it.itemName}</td>
                  <td className="r cs-num">{it.itemCount}대</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 직원불만_전문성부족 요인을 가진 회원들의 담당자(계약 manager_id) 명단
function ManagerPanel({ gymId, mode, period, statKey }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!gymId || !period) { setList([]); return; }
    setLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/result/stats/helper/complaintManagers`
      + `?gymId=${gymId}&mode=${mode}&period=${period}&statKey=${encodeURIComponent(statKey)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('담당자 조회 실패:', e); setList([]); })
      .finally(() => setLoading(false));
  }, [gymId, mode, period, statKey]);

  // 담당자별 회원 수 집계 (응답 행 = 회원 1명 + 담당자, managerId 기준 그룹)
  const byManager = {};
  list.forEach((m) => {
    const id = m.managerId ?? m.managerName;
    if (!byManager[id]) byManager[id] = { managerId: id, managerName: m.managerName, cnt: 0 };
    byManager[id].cnt += 1;
  });
  const managers = Object.values(byManager).sort((a, b) => b.cnt - a.cnt);
  const total = list.length;
  const max = managers.reduce((mx, x) => Math.max(mx, x.cnt), 0) || 1;
  const top = managers[0] || null;

  return (
    <div className="cs-side cs-side-mgr">
      <h5><NavIcon id="person" size={16} className="ui-icon" /> 이 회원들의 담당자</h5>
      {loading ? (
        <p className="cs-loading">불러오는 중…</p>
      ) : managers.length === 0 ? (
        <p className="cs-empty">배정된 담당자가 없어요.</p>
      ) : (
        <>
          <p className="cs-hint cs-hint--spaced">
            총 <b>{total}</b>명 · 최다 <b className="cs-accent">{top?.managerName}</b>
          </p>
          <div className="cs-side-body">
            <table>
              <tbody>
                {managers.map((x) => (
                  <tr key={x.managerId}>
                    <td className="cs-slot-name">{x.managerName}</td>
                    <td className="cs-slot-cell">
                      <div className="cs-slotbar"><i style={{ width: `${(x.cnt / max) * 100}%` }} /></div>
                    </td>
                    <td className="r cs-num">{x.cnt}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// 기구불만_기구상태불만 요인일 때 옆에 띄우는 서비스센터 전체 목록
function ServiceCenterPanel() {
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/result/stats/helper/serviceCenters`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCenters(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('서비스센터 조회 실패:', e); setCenters([]); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="cs-side cs-side-sc">
      <h5><NavIcon id="tool" size={16} className="ui-icon" /> 서비스센터 목록</h5>
      {loading ? (
        <p className="cs-loading">불러오는 중…</p>
      ) : centers.length === 0 ? (
        <p className="cs-empty">등록된 서비스센터가 없어요.</p>
      ) : (
        <div className="cs-side-body cs-center-list">
          {centers.map((c) => (
            <div key={c.centerId} className="cs-center">
              <div className="cs-center-name">
                {c.centerName}
                {c.brandName && c.brandName !== c.centerName && (
                  <span className="cs-muted cs-center-brand"> ({c.brandName})</span>
                )}
                <span className={`cs-center-repair ${c.onsiteRepair ? 'cs-good' : 'cs-crit'}`}>
                  <NavIcon id={c.onsiteRepair ? 'check' : 'close'} size={14} className="ui-icon" />
                  {' '}{c.onsiteRepair ? '출장 수리 가능' : '출장 수리 불가'}
                </span>
              </div>
              <div className="cs-ink-2"><NavIcon id="phone" size={14} className="ui-icon" /> {c.centerPhone || '-'}</div>
              {c.operatingHours && (
                <div className="cs-muted cs-center-hours">
                  <NavIcon id="clock" size={14} className="ui-icon" /> {c.operatingHours}
                </div>
              )}
              {c.url && (<a href={c.url} target="_blank" rel="noreferrer">홈페이지 바로가기 <NavIcon id="external-link" size={14} className="ui-icon" /></a>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 요인 아코디언 펼침 시 인라인 상세 — 회원 명단 + 조치 버튼/팝업 + 정보 패널
function FactorDetail({ statKey, members, loading, gymId, mode, period }) {
  const navigate = useNavigate();
  const action = FACTOR_ACTION[statKey];
  const showVisitTime = statKey === VISIT_TIME_FACTOR;
  const showEquip = statKey === EQUIP_FACTOR;
  const showManager = statKey === MANAGER_FACTOR;
  const showServiceCenter = statKey === SERVICE_CENTER_FACTOR;
  const isCoupon = statKey === COUPON_FACTOR;
  const isHelper = statKey === HELPER_FACTOR;
  const isTraining = statKey === TRAINING_FACTOR;
  const isPtTrial = PT_TRIAL_FACTORS.includes(statKey);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperText, setHelperText] = useState('');
  const [helperSending, setHelperSending] = useState(false);

  const [ptOpen, setPtOpen] = useState(false);
  const [couponTypes, setCouponTypes] = useState([]);
  const [selectedCouponNum, setSelectedCouponNum] = useState('');
  const [ptExpiry, setPtExpiry] = useState('');
  const [ptSending, setPtSending] = useState(false);

  useEffect(() => {
    if (!ptOpen || !gymId) return;
    const token = localStorage.getItem('accessToken');
    fetch(`${import.meta.env.VITE_BACKEND_URL}/coupon/type/list?gymId=${gymId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCouponTypes(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('쿠폰 종류 조회 실패:', e); setCouponTypes([]); });
  }, [ptOpen, gymId]);

  const submitPtTrial = async () => {
    const token = localStorage.getItem('accessToken');
    if (!selectedCouponNum) { alert('발송할 쿠폰을 선택하세요.'); return; }
    if (!ptExpiry) { alert('사용 만료 기한을 지정하세요.'); return; }
    const coupon = couponTypes.find((c) => String(c.couponNum) === String(selectedCouponNum));
    setPtSending(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/coupon/sendChurnTargets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          couponNum: Number(selectedCouponNum),
          couponName: coupon?.couponName,
          date: ptExpiry,
          usernames: members.map((m) => m.username),
        }),
      });
      if (res.ok) {
        const r = await res.json();
        alert(`${r.sent}명에게 발송 완료` + (r.skipped ? ` (이미 발송된 ${r.skipped}명 제외)` : ''));
        setPtOpen(false); setSelectedCouponNum(''); setPtExpiry('');
      } else {
        alert('쿠폰 발송에 실패했습니다.');
      }
    } catch (e) {
      console.error('PT체험권 발송 오류:', e);
      alert('통신 오류로 발송에 실패했습니다.');
    } finally {
      setPtSending(false);
    }
  };

  const submitHelper = async () => {
    if (!user.username) { alert('로그인 정보를 찾을 수 없습니다.'); return; }
    setHelperSending(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/result/helper/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, contents: helperText }),
      });
      if (res.ok) {
        alert('헬퍼 요청이 접수되었습니다. (처리대기)');
        setHelperOpen(false); setHelperText('');
      } else {
        alert('헬퍼 요청에 실패했습니다.');
      }
    } catch (e) {
      console.error('헬퍼 요청 오류:', e);
      alert('통신 오류로 헬퍼 요청에 실패했습니다.');
    } finally {
      setHelperSending(false);
    }
  };

  const showActionBtn = action && !showVisitTime && !showEquip && !showManager && !showServiceCenter;
  const actionCopy = isPtTrial ? 'PT 미가입·부상 위험군에게 체험권으로 전환을 유도합니다.'
    : isCoupon ? '할인 쿠폰 발행을 위해 프로모션 페이지로 이동합니다.'
    : isHelper ? '환경 불편 개선을 위해 헬스장을 도와줄 헬퍼를 요청합니다.'
    : isTraining ? '직원 응대 개선을 위해 직원 대상 교육 프로그램을 제공합니다.'
    : '이 요인 위험군에게 조치를 실행합니다.';
  const onAction = isCoupon ? () => navigate('/fitb/promotion')
    : isHelper ? () => setHelperOpen(true)
    : isPtTrial ? () => setPtOpen(true)
    : undefined;

  // 방문 공백 요인: 이 명단 중 오늘 이미 출석한 회원 수 (lastDays === 0 = 오늘 방문)
  const todayVisitedCount = members.filter((m) => m.lastDays === 0).length;

  return (
    <div className={`cs-fd-body${FILL_FACTORS.includes(statKey) ? ' cs-fd-body--fill' : ''}`}>
      {/* 스크롤 영역 = 표(리스트) 바깥. 표 자체는 전체를 보여주고 스크롤바는 이 영역 가장자리에서 나온다 */}
      <div className="cs-fd-scroll">
      {loading ? (
        <p className="cs-loading cs-muted">명단 불러오는 중…</p>
      ) : members.length === 0 ? (
        <p className="cs-empty cs-muted">해당 회원 없음</p>
      ) : (
        <div className="cs-fd-members">
          <table className="cs-mtable cs-mtable-head">
            <thead><tr><th>회원</th><th>ID</th><th className="r">이탈률</th></tr></thead>
          </table>
          <div className="cs-fd-memberscroll">
            <table className="cs-mtable">
              <tbody>
                {members.map((m) => {
                  const t = tierOf(m.churnRate);
                  return (
                    <tr key={m.username}>
                      <td>{m.name}</td>
                      <td className="cs-muted cs-num">{m.username}</td>
                      <td className={`r cs-num cs-${t.cls}`}>{(m.churnRate * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

        {/* 정보형 요인 = 조치 버튼 대신 참고 데이터 패널 (스크롤 영역 안) */}
        {showVisitTime && <VisitTimePanel gymId={gymId} mode={mode} period={period} statKey={statKey} />}
        {showEquip && <EquipmentPanel gymId={gymId} />}
        {showManager && <ManagerPanel gymId={gymId} mode={mode} period={period} statKey={statKey} />}
        {showServiceCenter && <ServiceCenterPanel />}
      </div>

      {/* 나이 요인: 회원 리스트 아래 가벼운 조언·지도 안내 (스크롤 밖 바닥 바, 구분선 위) */}
      {statKey === '나이' && (
        <div className="cs-fd-advice">위 회원들에게는 헬스장에서 따로 가벼운 조언·지도가 필요해요.</div>
      )}

      {/* 방문 공백 요인: 명단 중 오늘 이미 출석한 회원 수 안내 */}
      {statKey === '상대_방문공백' && (
        <div className="cs-fd-advice">이 명단 중 오늘 출석한 회원은 {todayVisitedCount}명이에요.</div>
      )}

      {/* 조치 버튼 (결과지향 문구) — 스크롤 영역 밖, 바닥 고정 푸터 */}
      {showActionBtn && (
        <div className="cs-fd-action">
          <span className="cs-fd-action-copy">{actionCopy}</span>
          <button type="button" className="cs-action-solid" onClick={onAction}>
            {!isHelper && !isTraining && !isCoupon && members.length > 0 ? `이 ${members.length}명에게 ` : ''}
            {action} <NavIcon id="arrow" size={15} className="ui-icon" />
          </button>
        </div>
      )}

      {/* 헬퍼 요청 팝업 */}
      {helperOpen && (
        <div className="cs-modal-back" onClick={() => !helperSending && setHelperOpen(false)}>
          <div className="cs-modal sm" onClick={(e) => e.stopPropagation()}>
            <h4><NavIcon id="bell" size={17} className="ui-icon" /> 헬퍼 요청</h4>
            <p className="cs-modal-desc">요청자: <b>{user.name || user.username}</b> · 상태: 처리대기로 접수됩니다.</p>
            <label className="cs-field-label" htmlFor="helper-text">추가로 적을 내용</label>
            <textarea id="helper-text" className="cs-textarea" value={helperText} onChange={(e) => setHelperText(e.target.value)} rows={4}
                      placeholder="요청 내용을 입력하세요 (예: 샤워실 환기 개선 요청)" />
            <div className="cs-modal-actions">
              <button type="button" className="cs-btn-ghost" onClick={() => setHelperOpen(false)} disabled={helperSending}>취소</button>
              <button type="button" className="cs-btn-primary" onClick={submitHelper} disabled={helperSending}>
                {helperSending ? '요청 중…' : '요청'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PT체험권(쿠폰) 발송 팝업 */}
      {ptOpen && (
        <div className="cs-modal-back" onClick={() => !ptSending && setPtOpen(false)}>
          <div className="cs-modal" onClick={(e) => e.stopPropagation()}>
            <h4><NavIcon id="coupon" size={17} className="ui-icon" /> 쿠폰 발송 설정</h4>
            <p className="cs-modal-desc">아래 <b>{members.length}명</b>에게 선택한 쿠폰을 발송합니다. (이미 발송된 회원은 자동 제외)</p>

            <label className="cs-field-label" htmlFor="pt-coupon">발송할 쿠폰</label>
            <select id="pt-coupon" className="cs-select" value={selectedCouponNum} onChange={(e) => setSelectedCouponNum(e.target.value)}>
              <option value="">-- 체험권 선택 --</option>
              {couponTypes.filter((c) => c.category === '체험권').map((c) => (
                <option key={c.couponNum} value={c.couponNum}>
                  {c.couponName} ({c.percent}% / {c.couponCount}회)
                </option>
              ))}
            </select>
            {couponTypes.filter((c) => c.category === '체험권').length === 0 && (
              <p className="cs-warn-text">등록된 체험권 쿠폰이 없어요. 프로모션에서 먼저 체험권을 만들어 주세요.</p>
            )}

            <label className="cs-field-label">대상 회원 ({members.length}명)</label>
            <div className="cs-target-box">
              {members.length === 0 ? <span className="cs-muted">대상 회원이 없어요.</span>
                : members.map((m) => (
                    <div key={m.username} className="cs-target-row">
                      {m.name} <span className="cs-muted cs-target-id">({m.username})</span>
                    </div>
                  ))}
            </div>

            <label className="cs-field-label" htmlFor="pt-expiry">사용 만료 기한</label>
            <input id="pt-expiry" type="date" className="cs-input" value={ptExpiry} onChange={(e) => setPtExpiry(e.target.value)} />

            <div className="cs-modal-actions">
              <button type="button" className="cs-btn-ghost" onClick={() => setPtOpen(false)} disabled={ptSending}>취소</button>
              <button type="button" className="cs-btn-primary" onClick={submitPtTrial} disabled={ptSending || members.length === 0}>
                {ptSending ? '보내는 중…' : '보내기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 드로어(우측)에서 요인 상세를 여는 로더 — 회원 명단을 조회해 FactorDetail 을 그대로 렌더한다.
// .cs-wrap 으로 감싸 Report.css 의 --cs-* 토큰이 드로어 안에서도 해석되게 한다.
export function FactorDetailLoader({ statKey, gymId, mode, period }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true); setMembers([]);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/result/stats/members`
      + `?gymId=${gymId}&mode=${mode}&period=${period}`
      + `&statType=factor&statKey=${encodeURIComponent(statKey)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) setMembers(Array.isArray(d) ? d : []); })
      .catch((e) => { console.error('회원 명단 조회 실패:', e); if (alive) setMembers([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [statKey, gymId, mode, period]);

  return (
    <div className="cs-wrap cs-in-drawer">
      <FactorDetail statKey={statKey} members={members} loading={loading}
                    gymId={gymId} mode={mode} period={period} />
    </div>
  );
}

// 이탈 요인 리스트 (FACTOR_ORDER 고정 순서) — 바 클릭 시 우측 통합 드로어로 상세를 연다
function FactorList({ items, gymId, mode, period }) {
  const factorRank = (k) => { const i = FACTOR_ORDER.indexOf(k); return i === -1 ? FACTOR_ORDER.length : i; };
  const factors = items
    .filter((b) => b.statType === 'factor')
    .sort((a, b) => factorRank(a.statKey) - factorRank(b.statKey));

  // 바 클릭 시 우측 통합 드로어(kind='report')로 상세를 연다 (계약 리스트와 동일 동선).
  const openInDrawer = (f) => {
    window.dispatchEvent(new CustomEvent('b2b-drawer-open', {
      detail: {
        kind: 'report',
        id: `${f.statKey}:${mode}:${period}`,
        title: `${factorLabel(f.statKey)} · ${period}`,
        data: { statKey: f.statKey, gymId, mode, period },
      },
    }));
  };

  if (factors.length === 0) return <p className="cs-empty cs-muted cs-pad">데이터 없음</p>;

  return (
    <div className="cs-factor-acc">
      {factors.map((f) => (
        <div key={f.statKey} className="cs-facc">
          <button type="button" className="cs-facc-row" onClick={() => openInDrawer(f)}>
            <span className="cs-facc-name"><span className="cs-facc-chev" aria-hidden="true">›</span>{factorLabel(f.statKey)}</span>
            <span className="cs-facc-bar">
              {/* 50% 이상은 accent, 49% 이하는 accent-strong (색 지정은 CSS가 담당) */}
              {f.pct != null ? (
                <i
                  className={f.pct >= 50 ? 'is-high' : 'is-low'}
                  style={{ width: `${Math.min(f.pct, 100)}%` }}
                />
              ) : null}
            </span>
            <span className="cs-facc-pct cs-num">
              {f.pct != null ? (<><b>{f.pct}%</b><span className="cs-facc-cnt">{f.memberCount}명</span></>) : '-'}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

// 위험도 4단계 분포 — 요약 스트립의 미니 누적 막대 + 범례
function RiskDistBar({ dist }) {
  const tiers = [
    { key: 'good', label: '안정', count: dist?.stableCount || 0, color: 'var(--tier-good)' },
    { key: 'warn', label: '관찰', count: dist?.watchCount || 0, color: 'var(--tier-warn)' },
    { key: 'serious', label: '개입', count: dist?.interveneCount || 0, color: 'var(--tier-serious)' },
    { key: 'crit', label: '긴급', count: dist?.critCount || 0, color: 'var(--tier-crit)' },
  ];
  const total = tiers.reduce((a, t) => a + t.count, 0);
  const sum = total || 1;

  return (
    <>
      <div className="cs-distcard-head">
        <span className="cs-skpi-label">위험도 분포</span>
        <span className="cs-dist-hint">경계 25 / 45 / 65%</span>
      </div>
      {total === 0 ? (
        <p className="cs-empty cs-muted">분포 데이터 없음</p>
      ) : (
        <>
          <div className="cs-distbar" role="img"
               aria-label={tiers.map((t) => `${t.label} ${t.count}`).join(', ')}>
            {tiers.map((t) => (t.count > 0
              ? <span key={t.key} style={{ width: `${(t.count / sum) * 100}%`, background: t.color }} />
              : null))}
          </div>
          <ul className="cs-dist-legend">
            {tiers.map((t) => (
              <li key={t.key}>
                <i style={{ background: t.color }} />{t.label}
                <b className="cs-num">{t.count}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// 신규 위험군 명단 (우측 레일 본문) — 헤더는 부모 카드에서 렌더
function RiskMembers({ riskList, loading }) {
  if (loading) return <p className="cs-loading cs-muted cs-pad">명단 불러오는 중…</p>;
  if (!riskList.length) return <p className="cs-empty cs-muted cs-pad">새로 진입한 위험군 회원이 없어요.</p>;
  return (
    <div className="cs-risklist">
      {riskList.map((m) => {
        const t = tierOf(m.churnRate);
        const reasons = [m.top1Reason, m.top2Reason, m.top3Reason].filter(Boolean);
        return (
          <div key={m.username} className="cs-rmember">
            <div className="cs-rmember-main">
              <div className="cs-rname">{m.name} <span className="cs-rid cs-num">{m.username}</span></div>
              <div className="cs-chips">
                {reasons.map((rsn, i) => (
                  <span key={i} className="cs-chip">{factorLabel(rsn)}</span>
                ))}
              </div>
            </div>
            <span className={`cs-rrate cs-${t.cls}`}>{(m.churnRate * 100).toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// 드로어(우측)에서 신규 위험군 명단을 여는 패널 — 돋보기 버튼이 b2b-drawer-open(kind='riskmembers')로 연다.
// .cs-wrap 으로 감싸 Report.css 의 --cs-* 토큰이 드로어 안에서도 해석되게 한다.
export function RiskMembersPanel({ data }) {
  const riskList = Array.isArray(data?.riskList) ? data.riskList : [];
  return (
    <div className="cs-wrap cs-riskdrawer">
      <RiskMembers riskList={riskList} loading={false} />
      <p className="cs-trust"><NavIcon id="lock" size={14} className="ui-icon" /> 우리 지점 데이터만 보여줍니다</p>
    </div>
  );
}

// 탭 전환 로딩 시 스켈레톤 — 요약 스트립 + 조치 카드 레이아웃을 모사
function StatsSkeleton() {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      <div className="cs-summary">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cs-skpi">
            <span className="cs-skel cs-skel--summary-label" />
            <span className="cs-skel cs-skel--summary-value" />
            <span className="cs-skel cs-skel--summary-sub" />
          </div>
        ))}
        <div className="cs-distcard">
          <span className="cs-skel cs-skel--dist-title" />
          <span className="cs-skel cs-skel--dist-bar" />
          <div className="cs-skel-legend">
            {[0, 1, 2, 3].map((i) => <span key={i} className="cs-skel cs-skel--dist-legend" />)}
          </div>
        </div>
        <div className="cs-skpi">
          <span className="cs-skel cs-skel--risk-label" />
          <span className="cs-skel cs-skel--risk-value" />
          <span className="cs-skel cs-skel--risk-sub" />
        </div>
      </div>
      <div className="cs-main">
        <section className="cs-panel-card">
          <div className="cs-cardhead">
            <span className="cs-skel cs-skel--panel-title" />
            <span className="cs-skel cs-skel--panel-sub" />
          </div>
          <div className="cs-skel-rows">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="cs-skel-row">
                <span className="cs-skel cs-skel--row-name" />
                <span className="cs-skel cs-skel--row-bar" />
                <span className="cs-skel cs-skel--row-value" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Report() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const gymId = user.gymId;

  // 트레이너 권한 사용자가 이탈 리포트 페이지로 직접 진입 시 접근 차단
  useEffect(() => {
    const role = String(user.role || '').toLowerCase();
    if (role === 'trainer') {
      alert('이탈 분석 리포트는 사장님만 확인하실 수 있습니다.');
      navigate('/fitb', { replace: true });
    }
  }, [user.role, navigate]);

  const [mode, setMode] = useState('daily');       // 'daily' | 'monthly'
  const [periods, setPeriods] = useState([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [openPeriod, setOpenPeriod] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(false);

  // 기준 기간: 선택 기간 ?? 최신 기간
  const focusObj = periods.find((p) => p.period === openPeriod) || periods[0] || null;
  const focusPeriod = focusObj?.period;

  const [riskList, setRiskList] = useState([]);
  const [riskLoading, setRiskLoading] = useState(false);
  const [showRiskPop, setShowRiskPop] = useState(false); // 신규 위험군 명단 팝오버
  const riskPopRef = useRef(null);

  // 팝오버 바깥 클릭 시 닫기
  useEffect(() => {
    if (!showRiskPop) return;
    const onDown = (e) => {
      if (riskPopRef.current && !riskPopRef.current.contains(e.target)) setShowRiskPop(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showRiskPop]);

  // 기간 목록 조회
  useEffect(() => {
    if (!gymId) return;
    setOpenPeriod(null);
    setBreakdown([]);
    setPeriods([]);
    setPeriodsLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/result/stats/periods?gymId=${gymId}&mode=${mode}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPeriods(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('기간 목록 조회 실패:', e); setPeriods([]); })
      .finally(() => setPeriodsLoading(false));
  }, [gymId, mode]);

  // 자동 선택: 일별=오늘 / 월별=이번 달, 없으면 최신 기간
  useEffect(() => {
    if (!periods.length) return;
    if (openPeriod && periods.some((p) => p.period === openPeriod)) return;
    const now = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const target = mode === 'daily'
      ? `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
      : `${now.getFullYear()}-${p2(now.getMonth() + 1)}`;
    const hit = periods.find((p) => p.period === target);
    setOpenPeriod(hit ? hit.period : periods[0].period);
  }, [periods, openPeriod, mode]);

  // 선택 기간의 이탈 요인 비율 조회
  useEffect(() => {
    if (!gymId || !openPeriod) { setBreakdown([]); return; }
    setLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/result/stats/breakdown?gymId=${gymId}&mode=${mode}&period=${openPeriod}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBreakdown(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('상세 비율 조회 실패:', e); setBreakdown([]); })
      .finally(() => setLoading(false));
  }, [gymId, mode, openPeriod]);

  // 신규 위험군 명단 — 기준 기간 연동
  useEffect(() => {
    if (!gymId || !focusPeriod) { setRiskList([]); return; }
    setRiskLoading(true);
    fetch(`${import.meta.env.VITE_BACKEND_URL}/result/stats/riskMembers?gymId=${gymId}&mode=${mode}&period=${focusPeriod}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRiskList(Array.isArray(d) ? d : []))
      .catch((e) => { console.error('위험군 명단 조회 실패:', e); setRiskList([]); })
      .finally(() => setRiskLoading(false));
  }, [gymId, mode, focusPeriod]);

  if (!gymId) {
    return <div className="cs-wrap"><div className="cs-inner"><p className="cs-empty-state">로그인한 사장님의 헬스장 정보를 찾을 수 없어요.</p></div></div>;
  }

  const unit = mode === 'daily' ? '날' : '달';
  const focusTier = focusObj ? tierOf(focusObj.avgChurnRate) : null;
  const total = focusObj?.totalMembers ?? 0;
  const risk = focusObj?.riskMembers ?? 0;
  const riskPct = total > 0 ? ((risk / total) * 100).toFixed(1) : '0.0';
  const avgPct = focusObj ? (focusObj.avgChurnRate * 100).toFixed(1) : '-';

  return (
    <div className="cs-wrap">
      <div className="cs-inner">

        {/* ── 통제: 제목 → 안내 문구 → 일별/월별 탭 + 기간 선택 ── */}
        <h2 className="b2blist-title">헬스장 이탈 통계</h2>
        <p className="b2blist-desc">
          선택한 {unit}의 위험군과 이탈 요인, 조치를 한 화면에서 확인합니다.
        </p>
        <div className="cs-controls">
          <div className="b2b-tabs" role="tablist" aria-label="집계 단위">
            {[['daily', '일별'], ['monthly', '월별']].map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`b2b-chip${mode === m ? ' is-active' : ''}`}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <PeriodPicker mode={mode} periods={periods} value={openPeriod} onPick={setOpenPeriod} />
        </div>

        {periodsLoading || (periods.length > 0 && (!openPeriod || loading)) ? (
          <StatsSkeleton />
        ) : periods.length === 0 ? (
          <p className="cs-empty-state">집계된 통계 데이터가 없어요. (배치 실행 후 표시됩니다)</p>
        ) : (
          <>
            {/* ── 요약: 읽기 전용 KPI 스트립 + 위험도 분포 ── */}
            <div className="cs-summary">
              <div className="cs-skpi">
                <div className="cs-skpi-label">전체 회원</div>
                <div className="cs-skpi-value cs-num">{total}<small>명</small></div>
                <div className="cs-skpi-sub">이 {unit} 기준</div>
              </div>
              <div className="cs-skpi">
                <div className="cs-skpi-label">위험군</div>
                <div className="cs-skpi-value cs-num cs-crit">{risk}<small>명</small></div>
                <div className="cs-skpi-sub cs-num">전체의 {riskPct}%</div>
              </div>
              <div className="cs-skpi">
                <div className="cs-skpi-label">평균 이탈률</div>
                <div className={`cs-skpi-value cs-num cs-${focusTier?.cls || 'good'}`}>{avgPct}<small>%</small></div>
                <div className="cs-skpi-sub">{focusTier && <span className={`cs-badge ${focusTier.cls}`}>{focusTier.label}</span>}</div>
              </div>
              <div className="cs-distcard">
                <RiskDistBar dist={focusObj} />
              </div>
              <div className="cs-skpi cs-skpi-risk" ref={riskPopRef}>
                <div className="cs-skpi-label">신규 위험군</div>
                <div className="cs-skpi-value cs-num">{riskLoading ? '…' : riskList.length}<small>명</small></div>
                <div className="cs-skpi-sub">직전 {unit} 대비</div>
                <button
                  type="button"
                  className="cs-riskpop-toggle"
                  aria-label="신규 위험군 명단 열기"
                  onClick={() => window.dispatchEvent(new CustomEvent('b2b-drawer-open', {
                    detail: { kind: 'riskmembers', id: 'new-risk', title: '신규 위험군', data: { riskList } },
                  }))}
                ><NavIcon id="search" size={17} /></button>
              </div>
            </div>

            {/* ── 이탈 요인별 조치 (전체 폭) ── */}
            <div className="cs-main" aria-busy={loading}>
              <section className="cs-panel-card">
                <div className="cs-cardhead">
                  <h3>
                    <NavIcon id="target" size={18} className="ui-icon" /> 이탈 요인별 조치
                    {' '}<span className="cs-crit cs-cardhead-count">위험군 {risk}명</span>
                  </h3>
                  <p className="cs-cardhead-sub">
                    요인을 펼치면 회원 명단과 조치가 함께 나옵니다.
                    <span className="cs-info" tabIndex={0} data-tip={"위험군(개입·긴급) 회원 대상.\n막대 = 요인 비율 (위험군 대비).\n한 회원이 이탈이유 Top3에 각각 집계되어\n최대 3개 요인에 중복될 수 있습니다."}><NavIcon id="info" size={14} className="ui-icon" /></span>
                  </p>
                </div>
                {openPeriod
                  ? <FactorList items={breakdown} gymId={gymId} mode={mode} period={openPeriod} />
                  : <p className="cs-muted cs-pad">상단에서 기간을 선택하세요.</p>}
              </section>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default Report;
