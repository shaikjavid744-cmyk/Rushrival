import { Component } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { ConsentProvider } from "@/lib/consent";
import { AdminAuthProvider } from "@/lib/adminAuth";
import SiteLayout from "@/components/site/SiteLayout";
import Home from "@/pages/site/Home";
import Features from "@/pages/site/Features";
import CatalogPage from "@/pages/site/CatalogPage";
import { NewsList, Article } from "@/pages/site/News";
import DownloadPage from "@/pages/site/Download";
import Faq from "@/pages/site/Faq";
import Support from "@/pages/site/Support";
import { Privacy, Terms, Cookies } from "@/pages/site/Legal";
import AccountDeletion from "@/pages/site/AccountDeletion";
import NotFound from "@/pages/site/NotFound";
import AdminLayout, { RequirePerm } from "@/components/admin/AdminLayout";
import AdminLogin from "@/pages/admin/Login";
import Dashboard from "@/pages/admin/Dashboard";
import Players from "@/pages/admin/Players";
import PlayerDetail from "@/pages/admin/PlayerDetail";
import Reports from "@/pages/admin/Reports";
import Ledger from "@/pages/admin/Ledger";
import Catalogue from "@/pages/admin/Catalogue";
import LiveOps from "@/pages/admin/LiveOps";
import Content from "@/pages/admin/Content";
import { ConfigVersions, ConfigVersion } from "@/pages/admin/Config";
import Flags from "@/pages/admin/Flags";
import Purchases from "@/pages/admin/Purchases";
import { TicketList, TicketDetail } from "@/pages/admin/Tickets";
import Releases from "@/pages/admin/Releases";
import Audit from "@/pages/admin/Audit";
import Admins from "@/pages/admin/Admins";
import Profile from "@/pages/admin/Profile";

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl p-10 text-center text-white" data-testid="route-error-boundary">
        <h1 className="font-display text-3xl">Something went wrong</h1>
        <p className="mt-2 text-[#d7e0f4]">This page hit an unexpected error.</p>
        <button type="button" className="rr-btn rr-btn-blue mt-6" onClick={() => window.location.reload()} data-testid="error-boundary-reload-btn">Reload</button>
      </div>
    );
  }
}

const Guard = ({ perm, children }) => <RequirePerm perm={perm}>{children}</RequirePerm>;

const ADMIN_ROUTES = [
  [null, <Dashboard />, "dashboard:view", true],
  ["players", <Players />, "players:view"],
  ["players/:id", <PlayerDetail />, "players:view"],
  ["reports", <Reports />, "reports:view"],
  ["transactions", <Ledger />, "economy:view"],
  ["catalogue", <Catalogue />, "catalog:view"],
  ["liveops", <LiveOps />, "liveops:view"],
  ["content", <Content />, "content:view"],
  ["config", <ConfigVersions />, "config:view"],
  ["config/:v", <ConfigVersion />, "config:view"],
  ["flags", <Flags />, "config:view"],
  ["purchases", <Purchases />, "purchases:view"],
  ["tickets", <TicketList />, "tickets:view"],
  ["tickets/:no", <TicketDetail />, "tickets:view"],
  ["releases", <Releases />, "release:view"],
  ["audit", <Audit />, "audit:view"],
  ["admins", <Admins />, "admins:manage_admins"],
];

const AdminRealm = () => (
  <AdminAuthProvider>
    <Outlet />
  </AdminAuthProvider>
);

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<AdminRealm />}>
            <Route path="login" element={<AdminLogin />} />
            <Route element={<AdminLayout />}>
              {ADMIN_ROUTES.map(([path, el, perm, index]) =>
                index ? <Route key="index" index element={<Guard perm={perm}>{el}</Guard>} /> : <Route key={path} path={path} element={<Guard perm={perm}>{el}</Guard>} />
              )}
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<p className="text-muted-foreground" data-testid="admin-not-found">This admin page doesn't exist.</p>} />
            </Route>
          </Route>
          <Route
            element={
              <ConsentProvider>
                <SiteLayout />
              </ConsentProvider>
            }
          >
            <Route index element={<Home />} />
            <Route path="features" element={<Features />} />
            <Route path="characters" element={<CatalogPage kind="characters" />} />
            <Route path="worlds" element={<CatalogPage kind="worlds" />} />
            <Route path="boards" element={<CatalogPage kind="boards" />} />
            <Route path="power-ups" element={<CatalogPage kind="powerups" />} />
            <Route path="news" element={<NewsList />} />
            <Route path="news/:slug" element={<Article />} />
            <Route path="download" element={<DownloadPage />} />
            <Route path="faq" element={<Faq />} />
            <Route path="support" element={<Support />} />
            <Route path="contact" element={<Support />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
            <Route path="cookies" element={<Cookies />} />
            <Route path="account-deletion" element={<AccountDeletion />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
