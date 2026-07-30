# Walk Forward Validation

Status: nicht out-of-sample validiert.

Die historische Konfiguration enthält eine Referenz-Beat-Rate von 60%. Da vier Strategy-Sleeves keine Engine-Parität besitzen, ist dieser Wert nicht als sauberer Rolling-Walk-Forward-Nachweis verwendbar.

Erforderlich:

1. unveränderliche Parameter und Trade-Exports je Sleeve
2. mehrere zeitlich saubere Train/Test-Fenster
3. Kosten und Slippage in jedem OOS-Fenster
4. quartalsweise Rebalancing-Parität
5. dokumentierte IS-/OOS-Degradation und Gewichtsstabilität

Bis dahin lautet die Klassifikation „weiterer Forward-Test erforderlich“.
