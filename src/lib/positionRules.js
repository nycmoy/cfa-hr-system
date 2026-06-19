// Determines which positions are "required" for a given employee based on
// their area (foh/boh/both) and whether they're on the leadership track.
// Leadership positions are additive — they only apply if leadershipTrack is true.
export function applicablePositions(employee, allPositions) {
  const area = employee.area || 'both'
  return allPositions.filter(pos => {
    if (pos.leadership) {
      return !!employee.leadershipTrack
    }
    if (area === 'both') return true
    return pos.area === area || pos.area === 'both'
  })
}

// Given an employee + their existing ratings/training records, returns
// the list of applicable positions for which they have NO record yet.
export function missingForEmployee(employee, allPositions, existingPositionIds) {
  const applicable = applicablePositions(employee, allPositions)
  const haveSet = new Set(existingPositionIds)
  return applicable.filter(pos => !haveSet.has(pos.id))
}
