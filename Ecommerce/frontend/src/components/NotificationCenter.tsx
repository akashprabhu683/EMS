import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock, Package, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeUserNotifications,
  markNotificationAsRead,
  type InAppNotification,
} from '../services/notificationService';
import { Link } from 'react-router-dom';

export function NotificationCenter() {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setNotifications([]);
      return;
    }

    const unsub = subscribeUserNotifications(user.id, (notifs) => {
      setNotifications(notifs);
    });

    return () => unsub();
  }, [isAuthenticated, user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!isAuthenticated) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    for (const n of notifications.filter((n) => !n.read)) {
      await markNotificationAsRead(user.id, n.id);
    }
  };

  const handleItemClick = async (notif: InAppNotification) => {
    if (!notif.read && user?.id) {
      await markNotificationAsRead(user.id, notif.id);
    }
    setIsOpen(false);
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        aria-label="View notifications"
        title="Order Notifications"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 bg-emerald-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed left-3 right-3 top-[68px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-w-sm sm:max-w-none bg-white rounded-2xl shadow-2xl border border-slate-200 py-3 z-50 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between px-4 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Bell size={15} className="text-emerald-700" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Order Notifications
              </h3>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1"
              >
                <Check size={12} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <Bell size={24} className="mx-auto opacity-30" />
                <p className="text-xs font-medium">No alerts yet</p>
                <p className="text-[11px] text-slate-400">Order updates will appear here in real time</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <Link
                  key={notif.id}
                  to="/orders"
                  onClick={() => handleItemClick(notif)}
                  className={`block px-4 py-3 hover:bg-slate-50 transition-colors text-left ${
                    !notif.read ? 'bg-emerald-50/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-bold ${!notif.read ? 'text-emerald-900 font-display' : 'text-slate-800'}`}>
                      {notif.title}
                    </p>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                    {notif.body}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatTime(notif.createdAt)}
                    </span>
                    <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                      View Order <ChevronRight size={10} />
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="px-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Dispensary in-app alert feed</span>
            <Link
              to="/orders"
              onClick={() => setIsOpen(false)}
              className="text-emerald-700 font-semibold hover:underline"
            >
              Order History →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
