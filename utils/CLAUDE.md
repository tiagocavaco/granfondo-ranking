# @granfondo/utils

Scoring formulas used by the scraper pipeline. No dependencies.

## Export: `./scoring`

### Athlete points

- `posToBasePoints(pos)` — maps a gender finishing position to base points using `ATHLETE_POINTS_TABLE` (75 pts for 1st, down to 1 pt for top 50, 0 beyond).
- `finisherCoefficient(finisherCount)` — scales points by race size. Reference is 300 finishers = 1.00 (√(n/300), rounded to 2dp). Larger races award more points.
- Final athlete points = `posToBasePoints(genderPos) × finisherCoefficient(finisherCount)`.

### Team points

- `rankToTeamBasePoints(rank)` — maps a team rank to base points using `TEAM_POINTS_TABLE` (25 pts for 1st, down to 1 pt for top 10, 0 beyond).
- `teamCoefficient(totalTeams)` — scales by number of competing teams. Reference is 25 teams = 1.00.
- A team qualifies for ranking if it has ≥ 3 scoring athletes in a distance. Only the top 3 athletes per team score.
