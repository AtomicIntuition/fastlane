'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin-layout.module.css';

interface AdminNavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin/fastlane', label: 'Overview' },
  { href: '/admin/fastlane/webhooks', label: 'Webhook Recovery' },
  { href: '/admin/fastlane/kpi', label: 'KPI Dashboard' },
  { href: '/admin/fastlane/readiness', label: 'Readiness' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.links} aria-label="FastLane admin navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const className = isActive ? `${styles.link} ${styles.linkActive}` : styles.link;

        return (
          <Link
            key={item.href}
            className={className}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

