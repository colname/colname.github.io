export function calculateRanking(session) {
  const stats = new Map(session.players.map(player => [player.id, {
    id: player.id,
    name: player.name,
    order: player.order,
    played: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    net: 0,
    rank: null
  }]));

  let validMatches = 0;
  for (const match of session.matches) {
    const a = Number(match.score?.a || 0);
    const b = Number(match.score?.b || 0);
    if (match.status !== "completed" || match.scoreRecorded === false || a === b) continue;
    validMatches += 1;
    const leftWon = a > b;
    match.teams[0].forEach(id => {
      const player = stats.get(id);
      if (!player) return;
      player.played += 1;
      player.pointsFor += a;
      player.pointsAgainst += b;
      leftWon ? player.wins += 1 : player.losses += 1;
    });
    match.teams[1].forEach(id => {
      const player = stats.get(id);
      if (!player) return;
      player.played += 1;
      player.pointsFor += b;
      player.pointsAgainst += a;
      leftWon ? player.losses += 1 : player.wins += 1;
    });
  }

  const ranking = [...stats.values()].map(player => ({
    ...player,
    net: player.pointsFor - player.pointsAgainst
  }));
  ranking.sort((left, right) =>
    (right.wins - left.wins) ||
    (right.net - left.net) ||
    (left.order - right.order)
  );
  if (validMatches > 0) {
    ranking.forEach((player, index) => {
      const previous = ranking[index - 1];
      player.rank = previous && previous.wins === player.wins && previous.net === player.net
        ? previous.rank
        : index + 1;
    });
  }
  return { ranking, validMatches };
}
