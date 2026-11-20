import RequireRole from "../components/RequireRole";
import DashboardShell from "../components/shell/DashboardShell";
import SellerStatusBanner, { SellerApprovalGate } from "./SellerStatusBanner";

export default function SellerLayout({ children }: LayoutProps<"/seller">) {
  return (
    <RequireRole role="seller">
      <SellerApprovalGate>
        <DashboardShell role="seller">
          <SellerStatusBanner />
          {children}
        </DashboardShell>
      </SellerApprovalGate>
    </RequireRole>
  );
}
