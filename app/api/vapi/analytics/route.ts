import { NextRequest, NextResponse } from "next/server";
import { getVapiDashboardData, isVapiConfigured } from "@/lib/vapi-api";

// GET - Fetch analytics from VAPI API
export async function GET(request: NextRequest) {
  try {
    // Check if VAPI is configured
    if (!isVapiConfigured()) {
      return NextResponse.json(
        { error: "VAPI is not configured", code: "VAPI_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    
    // VAPI free tier only allows 14 days of history
    const days = Math.min(parseInt(searchParams.get("days") || "14"), 14);
    const limit = parseInt(searchParams.get("limit") || "100");

    // Fetch dashboard data from VAPI
    const dashboardData = await getVapiDashboardData({ days, limit });

    // Calculate KPI data
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Filter calls for monthly and daily counts
    const monthlyCalls = dashboardData.calls.filter(
      call => new Date(call.createdAt) >= startOfMonth
    ).length;

    const dailyCalls = dashboardData.calls.filter(
      call => new Date(call.createdAt) >= startOfToday
    ).length;

    // Calculate appointment/conversion rate
    const appointmentCalls = dashboardData.calls.filter(call => {
      const content = (call.summary || call.transcript || '').toLowerCase();
      return content.includes('appointment') || content.includes('schedule') || content.includes('book');
    }).length;

    const appointmentRate = dashboardData.analytics.totalCalls > 0
      ? Math.round((appointmentCalls / dashboardData.analytics.totalCalls) * 100)
      : 0;

    // Calculate average duration in seconds
    const avgDurationSeconds = Math.round(dashboardData.analytics.avgDuration * 60);

    // Build call type distribution
    const typeDistribution = {
      appointment: 0,
      inquiry: 0,
      follow_up: 0,
      cancellation: 0,
    };

    dashboardData.calls.forEach(call => {
      const content = (call.summary || call.transcript || '').toLowerCase();
      
      if (content.includes('cancel')) {
        typeDistribution.cancellation++;
      } else if (content.includes('follow') || content.includes('follow-up')) {
        typeDistribution.follow_up++;
      } else if (content.includes('appointment') || content.includes('schedule') || content.includes('book')) {
        typeDistribution.appointment++;
      } else {
        typeDistribution.inquiry++;
      }
    });

    // Format daily activity for charts
    const dailyActivity = dashboardData.dailyActivity.slice(-7).map(day => ({
      date: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
      calls: day.calls,
      appointments: Math.round(day.calls * (appointmentRate / 100)), // Estimate based on rate
    }));

    return NextResponse.json({
      success: true,
      source: "vapi",
      kpi: {
        monthlyCalls,
        dailyCalls,
        avgDuration: avgDurationSeconds,
        appointmentRate,
        totalCalls: dashboardData.analytics.totalCalls,
        totalMinutes: dashboardData.analytics.totalMinutes,
        totalCost: dashboardData.analytics.totalCost,
        successRate: dashboardData.analytics.successRate,
      },
      typeDistribution,
      callsByType: dashboardData.analytics.callsByType,
      callsByStatus: dashboardData.analytics.callsByStatus,
      dailyActivity,
      rawAnalytics: dashboardData.analytics,
    });
  } catch (error) {
    console.error("Error fetching VAPI analytics:", error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      { 
        error: "Failed to fetch analytics from VAPI", 
        details: errorMessage,
        code: "VAPI_FETCH_ERROR"
      },
      { status: 500 }
    );
  }
}

