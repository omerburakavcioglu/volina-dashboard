"use client";

import { useTenant } from "@/components/providers/TenantProvider";
import { useAuth } from "@/components/providers/SupabaseProvider";

// Import dashboard components
import InboundDashboard from "@/components/dashboards/InboundDashboard";
import OutboundDashboard from "@/components/dashboards/OutboundDashboard";

export default function TenantDashboardPage() {
  const { tenantProfile } = useTenant();
  const { user } = useAuth();
  
  // Default to outbound dashboard - smileandholiday uses outbound
  const dashboardType = tenantProfile?.dashboard_type || user?.dashboard_type || 'outbound';

  // Render immediately - dashboard components handle their own loading states
  if (dashboardType === 'outbound') {
    return <OutboundDashboard />;
  }

  return <InboundDashboard />;
}
