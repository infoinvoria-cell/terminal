# Live Model

Status: nicht live.

Die UI unterscheidet Zielallokation, historische Asset-Daten, TV-Strategiereferenzen, Paper/Forward und echte Live-Daten. Ohne einheitliche Engine-Parität und echte Provider-/Brokerpositionen bleiben aktuelle Gewichte, Rebalancingbedarf und Live-Risiko nicht verfügbar.

Ein Live-Status darf erst gesetzt werden, wenn:

- alle acht Komponenten denselben Stichtag und dieselbe Engine nutzen
- Feed-Aktualität und Stale-Schutz erfolgreich sind
- aktuelle Brokerpositionen und Cash vorliegen
- Ziel-/Ist-Abweichung und Rundung reproduzierbar sind
- letzter erfolgreicher Lauf gespeichert ist

Die Analytics-Live-Ansicht ist bis dahin explizit blockiert.
