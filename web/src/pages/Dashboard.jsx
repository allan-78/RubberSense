// ============================================
// 📊 Dashboard Page
// ============================================

import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo-section">
            <span className="logo-icon">🌳</span>
            <h1>RubberSense</h1>
          </div>
          
          <div className="user-section">
            <div className="user-info">
              <p className="user-name">{user?.name}</p>
              <p className="user-role">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="welcome-section">
          <h2>Welcome back, {user?.name}! 👋</h2>
          <p>Manage your rubber tree monitoring system</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🌳</div>
            <div className="stat-content">
              <h3>Total Trees</h3>
              <p className="stat-value">0</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📸</div>
            <div className="stat-content">
              <h3>Total Scans</h3>
              <p className="stat-value">0</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🥛</div>
            <div className="stat-content">
              <h3>Latex Batches</h3>
              <p className="stat-value">0</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>Healthy Trees</h3>
              <p className="stat-value">0</p>
            </div>
          </div>
        </div>

        <div className="info-section">
          <div className="card">
            <h3>🚀 Quick Actions</h3>
            <p>Dashboard features coming in next steps:</p>
            <ul>
              <li>View and manage rubber trees</li>
              <li>Review scan history</li>
              <li>Analyze latex quality</li>
              <li>Monitor market prices</li>
              <li>Generate reports</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
