# IBKR Implementation

IBKR-Bereitschaft: nicht produktionsgeeignet.

Für QQQ, GLD, SPMO und SPY fehlen im kanonischen Modell noch verifizierte `conId`, Börse, Primärbörse, Handelswährung, Fractional-Share-Regel, Tick Size und Order-Rundung.

Für HG und 6S fehlen insbesondere finaler Future-Contract statt Continuous Reference, Verfall/Roll, Multiplikator, Margin, Handelssitzung und FX-Behandlung.

Keine CFDs werden als Zielinstrumente freigegeben. Continuous Symbole `HG1!` und `6S1!` sind Datenreferenzen, keine ausführbaren IBKR-Kontrakte.
