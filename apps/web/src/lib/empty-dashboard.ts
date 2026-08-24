export function emptyDashboardResponse() {
  const chart_data = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      total_runs: 0,
      success_rate: 100,
      records_count: 0,
    };
  });

  return {
    stats: {
      total_scrapers: 0,
      healthy_scrapers: 0,
      failing_scrapers: 0,
      healing_scrapers: 0,
      escalated_scrapers: 0,
      total_runs: 0,
      total_healed: 0,
      total_failed: 0,
      success_rate: 100,
      avg_recovery_time: 0,
      total_cached_runs: 0,
      local_version_recoveries: 0,
      ai_healed_runs: 0,
      manual_overrides: 0,
    },
    activity: [],
    chart_data,
    db_warning: 'Database unavailable — showing empty dashboard. Check DATABASE_URL.',
  };
}
