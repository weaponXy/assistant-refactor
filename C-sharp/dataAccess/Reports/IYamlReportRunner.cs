using dataAccess.Contracts;
using dataAccess.Planning;

namespace dataAccess.Reports;

/// <summary>
/// Interface for YAML-driven report generation with slot-filling validation.
/// </summary>
public interface IYamlReportRunner
{
    /// <summary>
    /// Executes a report based on a validated planner result.
    /// Performs slot validation against YAML rules before execution.
    /// Returns OrchestrationStepResult with clarification request if slots are missing.
    /// </summary>
    Task<OrchestrationStepResult> RunReportAsync(PlannerResult plannerResult, CancellationToken ct = default);
}
