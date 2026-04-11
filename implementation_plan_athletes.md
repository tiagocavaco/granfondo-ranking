Implementation plan for building Athlete data with consistency:

When we are mapping the athlete data we need to follow the next order:
1. On the first iteration we only care about athletes that have licenses (except dummy ones like 10000000000 or 1), since that gives us the most accurate data, because a license must be unique per athlete, and here we will build the athlete json files adding on the json of each athlete two extra agregate fiels, one for all teams that the athlete has been, and other for all categories the athlete had over the years (used in a next iteration for dedup), and the list of races of course
2. After we have mapped out all athletes with license then we start the second iteration, that is for all athletes mapped with licenses lets try to find other results from them where they have races without license, here we will match athletes that have same name and match any team that athlete has been (also use the team_alias for manual overrides)
3. Then we need to take into account that some athletes with license may have raced as Individual/Solo, without team basically, and here we will use the athlete aliases, we will never merge them automatically unless there is a explicit athlete alias without team for that athlete
4. At this point all athletes with license should have all their races mapped out, the ones where they used license, the ones where they races without license but in one of their teams, the ones he races as individual
5. Now we can map the remaining unmapped athletes starting by matching name and team (also use the team_alias for manual overrides) and apply point 3. here as well as a follow up


General important safeguards: 
We cannot have an athlete with two result entries for the same event id in same year, if that happens we need to dedup by category, and get only the result from the category that matches the athlete category for that year already mapped from the 1. iteration, if we can't dedup we must flag it to be manually looked

Invalid licenses:
  1. Negative:         /^-\d+$/
  2. Sci notation:     /^\d+\.\d+[eE]\d+$/
  3. 10^10 variants:   /^1000000000\d?$/
  4. All-zeros:        /^0+$/
  5. Too small:        numeric, no leading zero, value < 100
  6. Federation:       starts with "FEDERAC" or "FEDERAÇ" (case-insensitive)
  7. Explicit list:    "NAOFEDERADO", "11111", "12345", "23456"