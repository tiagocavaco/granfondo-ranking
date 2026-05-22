import { Link } from "react-router-dom";
import { SOLO_TEAM_KEYS, normalizeTeam } from "@granfondo/database/normalize";
import { resolveTeamId } from "@granfondo/api";

export function TeamLink({
  team,
  className,
  onClick,
}: {
  team: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const teamId =
    team && !SOLO_TEAM_KEYS.has(normalizeTeam(team))
      ? resolveTeamId(team)
      : undefined;

  if (teamId !== undefined) {
    return (
      <Link to={`/team/${teamId}`} className={className} onClick={onClick}>
        {team}
      </Link>
    );
  }
  return (
    <span className={className} onClick={onClick}>
      {team}
    </span>
  );
}
