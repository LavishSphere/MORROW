import { generateProposal } from '../../data/api'
import { SCENARIO } from '../../data/fixtures'
import type { Issue } from './issue'

/**
 * Plain-language draft for a finished street fix.
 * The Wellesley demo barrier uses the existing proposal path.
 * Every other issue stays an illustrative sentence.
 */
export async function draftFromFix(issue: Issue): Promise<string> {
  if (issue.id === SCENARIO.barrierId) {
    const result = await generateProposal({
      scenarioId: SCENARIO.id,
      barrierId: SCENARIO.barrierId,
      interventionId: SCENARIO.interventionId,
    })
    return result.draft.plainLanguageSummary
  }
  return `${issue.fix} This is an illustrative Wellesley proposal, not a field survey.`
}
