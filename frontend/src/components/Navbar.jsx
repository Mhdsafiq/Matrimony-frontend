import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import { getChatUnreadCount, isAuthenticated } from '../services/api';
import './Navbar.css';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const location = useLocation();

  const isLandingPage = !isAuthenticated() || location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register';

  useEffect(() => {
    let timeoutId;
    let isMounted = true;

    const fetchChatCount = async () => {
      try {
        if (isAuthenticated() && !isLandingPage) {
          const { unreadCount } = await getChatUnreadCount();
          if (isMounted) setUnreadChatCount(unreadCount);
        }
      } catch (error) {
        console.error('Error fetching unread chat count:', error);
      } finally {
        if (isMounted) {
          timeoutId = setTimeout(fetchChatCount, 2500); // 2.5s progressive polling
        }
      }
    };

    if (!isLandingPage) {
        fetchChatCount();
    }

    return () => {
        isMounted = false;
        clearTimeout(timeoutId);
    };
  }, [isLandingPage]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Link to="/" className="logo">
            <img src="/logo.png" alt="Sri Mayan" className="logo-img" />
          </Link>
        </div>

        {/* Desktop Menu - Hide on Landing Page */}
        {!isLandingPage && (
          <ul className="nav-links">
            <li><Link to="/home">Home</Link></li>
            <li><Link to="/search">Search</Link></li>
            <li><Link to="/interests">Interests</Link></li>
            <li>
               <Link to="/chat" style={{ position: 'relative' }}>
                  Chat
                  {unreadChatCount > 0 && (
                     <span style={{ position: 'absolute', top: '-8px', right: '-15px', background: 'red', color: 'white', fontSize: '0.7rem', padding: '2px 5px', borderRadius: '10px', minWidth: '16px', textAlign: 'center' }}>
                        {unreadChatCount}
                     </span>
                  )}
               </Link>
            </li>
            <li><Link to="/matches">Matches</Link></li>
            <li><Link to="/membership">Membership</Link></li>
          </ul>
        )}

        <div className="nav-actions">
          {!isLandingPage && (
            <NotificationDropdown />
          )}
          {isLandingPage && (
            <div className="landing-nav-actions">
              <Link to="/login" className="nav-login-link">
                Login
              </Link>
              <Link to="/" className="btn nav-register-btn">
                Register for Free
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle - Only if not landing page */}
        {!isLandingPage && (
          <button className="mobile-toggle" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        )}
      </div>

      {/* Mobile Menu */}
      {isOpen && !isLandingPage && (
        <div className="mobile-menu glass-panel">
          <Link to="/home" onClick={() => setIsOpen(false)}>Home</Link>
          <Link to="/profile" onClick={() => setIsOpen(false)}>My Profile</Link>
          <Link to="/search" onClick={() => setIsOpen(false)}>Search</Link>
          <Link to="/interests" onClick={() => setIsOpen(false)}>Interests</Link>
          <Link to="/chat" onClick={() => setIsOpen(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             Chat
             {unreadChatCount > 0 && (
                <span style={{ marginLeft: '6px', background: 'red', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>
                   {unreadChatCount}
                </span>
             )}
          </Link>
          <Link to="/matches" onClick={() => setIsOpen(false)}>Matches</Link>
          <Link to="/membership" onClick={() => setIsOpen(false)}>Membership</Link>
          <Link to="/settings" onClick={() => setIsOpen(false)}>Settings</Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
