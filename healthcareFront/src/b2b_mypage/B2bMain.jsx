import { Link, Outlet } from 'react-router-dom';
import { isGymRole, normalizeRole } from '../config/uiNavigation.js';
import NavIcon from '../components/uiIcons.jsx';
import './B2bMain.css';

function B2bMain() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const showGymMenus = isGymRole(user.role);

  return (
    <section className="b2b-profile-page">
      <header className="b2b-profile-page__header">
        <p>PROFILE</p>
        <h1>{user.name || '관리자'}님의 마이페이지</h1>
        <span>계정과 알림, 회원 관리 정보를 확인합니다.</span>
      </header>

      <nav className="b2b-profile-page__grid" aria-label="마이페이지 메뉴">
        {showGymMenus && (
          <Link to="b2bcomplaint" className="b2b-profile-page__card">
            <span className="b2b-profile-page__card-icon" aria-hidden="true"><NavIcon id="complaint" size={20} /></span>
            <strong>회원건의 접수현황</strong>
            <span>회원이 접수한 건의사항과 처리 상태를 확인합니다.</span>
          </Link>
        )}
        <Link to="notification" className="b2b-profile-page__card">
          <span className="b2b-profile-page__card-icon" aria-hidden="true"><NavIcon id="bell" size={20} /></span>
          <strong>알림 내역</strong>
          <span>계약, 정산, 물품과 운영 알림을 확인합니다.</span>
        </Link>
        <Link to="account" className="b2b-profile-page__card">
          <span className="b2b-profile-page__card-icon" aria-hidden="true"><NavIcon id="mypage" size={20} /></span>
          <strong>계정 설정</strong>
          <span>내 계정 정보와 기본 설정을 관리합니다.</span>
        </Link>
        {showGymMenus && (normalizeRole(user.role) === 'owner' || normalizeRole(user.role) === 'admin') && (
          <Link to="/fitb/report" className="b2b-profile-page__card">
            <span className="b2b-profile-page__card-icon" aria-hidden="true"><NavIcon id="churnlist" size={20} /></span>
            <strong>회원·이탈 분석</strong>
            <span>회원 현황과 이탈 위험 분석 결과를 확인합니다.</span>
          </Link>
        )}
        {showGymMenus && (
          <Link to="b2bcoupon" className="b2b-profile-page__card">
            <span className="b2b-profile-page__card-icon" aria-hidden="true"><NavIcon id="coupon" size={20} /></span>
            <strong>쿠폰 관리</strong>
            <span>발급한 쿠폰과 회원별 사용 상태를 확인합니다.</span>
          </Link>
        )}
      </nav>

      <div className="b2b-profile-page__outlet">
        <Outlet />
      </div>
    </section>
  );
}

export default B2bMain;
