import type { ReactNode } from 'react';
import styles from './admin-layout.module.css';
import { AdminNav } from './admin-nav';

export default function FastLaneAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.layout}>
      <header className={styles.navShell}>
        <div className={styles.navWrap}>
          <p className={styles.brand}>FastLane Admin</p>
          <AdminNav />
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
