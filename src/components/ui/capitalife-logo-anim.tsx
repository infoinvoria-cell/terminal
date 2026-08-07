"use client";

import { useEffect, useRef } from "react";

// The 5 pieces from hauptlogo_5_elemente_rechte_saeule_korrigiert.html
// Each piece stacks on top of the previous — sequential reveal builds the full logo
const PIECE_SRCS = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL4AAADcCAYAAADOSBvMAAAB90lEQVR4nO3WS2rDUBBFQSv737MyNcYfyYE81KdqBT04XPp2AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA19n3fV9/AeT+rD4AVhP8H1v66hE+S8L9k7a9N+CQJ/wvW/vqET5LwT7L2MwifJOGfYO3nED5JwidJ+Ad5c2YRPknCP8DazyN8koT/gbWfSfgkCf8Naz+X8EkS/gvWfjbhkyT8J6z9fMInSfgPrH2D8EkS/h1r3yF8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJ/862bdvqG/gfwidJ+A+sfoPwnxD/fMJ/QfyzCZ8k4b9h9ecS/gfin0n4JAn/AKsPAAAAAAAAAAAAAAAAAAAAA/wC4H842xLlN/0AAAAASUVORK5CYII=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL4AAADcCAYAAADOSBvMAAAC10lEQVR4nO3YPW4TURSA0Q8QFUJyQUHpPhIKFK5ZQrISCjbADrIUs4400LhmKymcSCDlZ2wQnsk9p7Q90iuun+w3BgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABRu+3mYrfdfDv1HEv38tQDcLCrMcaX3XazOvUgSyb8Bbnd9OsxxmrsvwAc6cWpB2Ca2w3/a+yjv/Px7PL65ynmWTobfzmuxp/R373GEWz8BdhtN+djjB8PvH15dnn9/f9N8zzY+Mvw2Ga39Y8g/JnbbTcXY4zPj3xk7bx5OOHP35SN7rx5IOHP2G/ny6eshp88B/HndqYeOF8+xXlzIht/vu47X055hgls/BnabTfrsd/2x7D1J7Dx52n9F8+u/tEMz5rwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCZ8k4ZMkfJKET5LwSRI+ScInSfgkCX+G3n/4ev7m3afx6vXbU48CAAAAAAAAAAAAAMD9bgADYi60GLm55QAAAABJRU5ErkJggg==",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL4AAADcCAYAAADOSBvMAAAChUlEQVR4nO3WMU5UYQCF0V8kQQoTJsQeSWyoWALuwILSRJdgPQ3ugCWwBPYxy5iV2NqgM8wjj8d3zgpu8RV3DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgNdlu1j/n3jC1o7kHsAg/3lr8wmdX99vN+nruEVMRPrs6G2M8bDfrs5l3TEL47ON6jPEw94gpCJ99fdtu1r/mHnEo4fMci//7wue5Hpf894XPc12MBf994XOIxf594XOoRf594TOFxf194TOFi7Gwvy98prKovy98pnS/3axv5h6xC+EztUX8feEztbMxxuPcI/5H+LyEm+1m/XvuEf8ifF7K3Wv++8LnJd3NPeApwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJnyThkyR8koRPkvBJEj5JwidJ+CQJn6TjuQfw9hy9/zBOV1fj/PL269xbniJ8JnO6uhqfvnx/N/eOXQifgywp9r8Jn70cn6zGycfP4/zydnGxAwAAAAAAAAAAAAAAALCLP71lM2T9VecQAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL4AAADcCAYAAADOSBvMAAAEwUlEQVR4nO3c3W0c5xUG4Hdi2QYMOKYvc8cOrA60riBMBbEqiFyBlQpkVyC6A7oCrivwqgJvbnKZLBAESfyDk4tvKEpr8Z87s8N5HoAQuX9zJL1z9sy3H5gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjqarTsWtgOL8buwAYg+AzS4LPLAk+syT4zJLgM0uCzywJPrMk+MyS4DNLgs8sCT6zJPjMkuAzS4LPLE0u+FX1eOwamL7JBT/JqfBzV1MM/kGSo5FrYOImFfyqqrFr4GGYVPBhW1U9v01DfLSLYmAIVfUyyRf995UkXdd113mu4DM5VXWQ5DTJ43fcd60TYDKjjvme5PVy9g95R+i3HndpXiYTfKiqL9I6/eE1H18XnQBGHfZeP9q8SD/P3+L5vxl/JtHxjTnz1Y82p7ll6Ldeq6rqn8lEgj8UJ9h+qapnucY8f0MHiVGHPVRVh0leJlns6hg6/hZdf1xV9TzJj9ld6J8mE+j4YwSxquq6H4RwP6pqkdblD3d4mKdd1x0nOv6FdP5hVNVhVZ3mBsuUt/Q69MkEgq/zPkx94F9mt2PNmbdCn0xg1Ela+I08D0O/Jv8syV/Sr7Ds0CbJn7quW27fMYngj0n470e/UvNV7mE9/prWaaFfvevOyQR/rK7P3fQXrX/OcIFPklWSz7uu21z0gMkEPzHyTM1P//77GI3quOu6p1c9aO8vbrf1AVwPfdy6xNC17Luzf5f3P/rDkIfdpF3EXhn6SYLBT5LtK/SxVdWzfoadrV9/+c+YjWCVNtocj3Dsaauq08u6+jX9WFUvqupo7L/PEN4M+4heVFspuhFza6/ahyiLe37ZZZLv0zrS8rKLrX1VVYdd162T5Of//qMeffjpyBW9tkkbbU5u82TB7+0o+NvWaSfBq7STYn0Wqn1QbQvwYdpuyCf9nwdj1XOJr5P89S6NRPB7AwX/Isu0DvYqyabruq93cZA+2Af91+P+5idbP++zdVqXX971hQS/N3Lwr/Trz//Kow9+f+X/1y//2/zw3gefbN64abGzooazSfJN13XP7+sFJ7WOP2fvvf/xXDfOHSf58r6vjwSffbVMG2vWu3jxSa7j86At09bkP9/lhb+Oz744TpvjV0McTPAZ0ybngV8PeWDBP/dd2hr24bhlzMIqyTdJTsb6UM9y5pZq2w3+mGG30c7BJq27fzvUOHMZwb9Av//jKG0v+WLMWibuJC3sJyPX8RbBv4ZqOy+P0j7lPBqzlok4SRsdRxtlriL4N/TGO8GTtHeCw/Gq2RvrtGXI7/ats19E8O+o3/+yyPmJcDBeNYPZ5Hzn6XIfZvabEvx71o9FiySfpW38WoxXzb1Z5nxX6WqKQd8m+APY2u77Wdq7wmKsei6xShtbXp19/xBC/i6CP7Jqv4UgOd/7/kne3iJ8dvtdrNLGk6QF+29bt6/29SJ0V/4P/JVhkubgz/gAAAAASUVORK5CYII=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAL4AAADcCAYAAADOSBvMAAAKUElEQVR4nO3d4XXbOBaG4UtXoA5WW8Gog6iD0VYw2grirSBJBd6pwJ4K7FRgpQIpFchbgdTBtz9AOYrGshXjkhcg3+ecORlPRhBgf4QvQZBqDKEkzcxsYmbT9h8zsw9H/8vh799rb2abo6+/nfz3fdM0x38/Ck10B8ZA0sRSgGdm9o/2z6n9CHoJ9pYOhI2Z/e/w703T7KM61CWC7+wo5HNLM/fUygr4r3qydBB8N7OVDeRgIPiZ2qDPLYV8bin0Q7exdBB8N7OHGg8Egv8OkuZm9ruNJ+hv2Vg6EL42TbMK7cmFCP6FJC0shX1heSebQ7e39iCwgn8bEPxXEHYXD1bgQUDwT7TLi3+Y2dIIu7c7S+XQQ3A/CL7Z8wnqwsw+GjV7H57M7C8zu2ua5imiA6MOvqSppbAvjdk9yp2Z/dX3SfEog9+uyny0NMujDCsz+9LXATCq4LeB/2RpGRJlerJ0ANx1+SajCD6Br9LGzP7T1W+AQQefwA/CytIBsPFsdJDBb09ab2x4NfzqHa+ZO/chyp2lA2Dv0diggt8uS15bmuVrsrF0xfOwZXjV/vnkudzXTgjT9st5++eHk69LtrdU//83t6HBBL+9ynpjZe+E3NuPzV0bS8HexHXnZ0cHxtzMfrMf26dLs7LM8qf64Lez/K2VWdZsLP2QvlnazvsU2Zn3ONp9OrMfO1BL8aVpms/veWHVwZd0bamsmcT25Nne0t6Ub1bY3hQvJ9uwFxb/G2FjZv+qcVL5ZZImkh5Vhq2kG6U9PqMjaSbps6R13I9AO0nL6O9FpyQt2oFG2mrEYT9H6SC4ab8/EW6VfiMNh9IsfxP0DT24Vbo2gDcoTVD3AT+jtdJJev2UZpJ1wDdRSrPXtYY2k/RE0lSpFNr1+DPbqfYJSnGlzaPSEikcKP3GXqrfMmgZPe53UUxpc6vaZ4vCqd8D4CZ6vBdTmh3ue/rGHNxqKLVhJdTfAXAbPdY3KdWE6x6+GQePIvBhlCa5Ps4Byg2/0kls19+Ag7UoaYqhNOHdd/wzv1VpixSS5uon9DvVetIzAm0Oth3+/B+jx/hMqdbrw61KO+LxN+r+mk182aN+Qr8VZU111N3sv44eWB+hvxGzfLWUZv9bxzysQ/Og7kO/E7P8YMjnQuZaAw/9fegA0QnlbV1Zh2ZC3Yf+Omxw6JzeV/qsFRz6hXPIj+3ENuHRULoodYm1gkPf5cWp2MEhhN6uHsJDP+0w9LeEfrx0fkLdKbICUKrJ1h2Fvp6dd+jMC+GPDX3bqceOQr8MHRiK0oZ/W0robwg9+qJUXcyiO9HFsuWO0KNY6mYFZ6fooxk4R92dzM6jxwacJd8NRQfL6HEBZ6mbK7PL6HEBZ6mbi1TL6HEBr5L/en38XTLAa5SeNOapnPsigZfIv8RZi703KJ18HwmxE2v1KJ38V3EW0WMCXqV0oWrrGHp2WqJ8uvwOmEvEPu4BuITSCa2XnajrUQP5rtlfR48HeJPS0628sF6POshvtt+Jx3OjBvJdvvwcPR6M1y99wLOkrfl8oO9T0zT/dGgHeJerS/9HpZ2SU6f3/bdTO0C35HdX1X30WICLyG8lZydOaFEL+a3kfI4eC3ARpScmeNiJ7cYoxCUntx+d3utL0zR7p7aALK8uZ7Yz9M7hfVi+RFHemvGXTu/zxakdoHvy2W+/jR4HcOrsjK+0VXjq8B5/OrQBuHqt1PnDof29md05tAP0Qz5PThj87YTifoLhkN8uzGn0WLqk9op2dD/gRD4Pfh30nhylm+13BH9A5FPmLKLH0SUdbeOI7gscyGdD2qCXMHX0hInovuB9XlrV+d2h3QeHNoqk9AEVn6L7AWfy2Xc/ix5HF3RU1zPbD4h8npcz2DJHJ5NCdH/wfqelztyhzQeHNoqjdE1idvi6aZpful8ZBZPPMuYsehze9MJ1jeg+wZHyN6UNrszRC8//j+4T8j2XOkpXWaeZ7a0yX1+iezObRHcCvo5r/LlDe18d2iiGTup6M2r7wZF0k1nmSAO6p1Zn9itF9wvOlP8khcE8415nPtcrul/w41nqrDJfXxLq+oG7Mnu+2yrXN4c2wumFuh7Dc5jxpw5tbRzaCKX0fNDrl/6Ok9phOQR/ltnOvmmap8w2QrW/9QZ/xxiSQ/B/y2xnk/n6EnyyM3U9s/3wHII/yWxnCPX9JLoD6M8h+PPMdp4yX18sZvthunK66PTk0AbQmytzWLprmmaV3ZMCMdsP15Xl17b7/G4A/fKY8Tf53SgPs/2wXfzhb6/YO7QB9OrK8tfwv3t0pCTM9sPnUeMD1fEodTYObRSD2X4cWNXBKLms4w8Fs/14sKqDUcoOftM0G4d+AL3ymPGB6hB8jBLBxygRfIwSwccoEXyMEsHHKBF8jBLBxygRfIwSwccoZQff6YGzQK88ZvyJQxtAr66Mh0FhhDyCP8nvBtAvj1Jn5tAG0Ksr4w4qjNCV5T8XJ/e5PEDvWNXBKF1Z/nNxZvndAPrlUeNP8rsB9MtlHV/SPLsnQI+unD6tcOLQBtCbw8ntJrOdWebrgV4dgr/PbOdD5uuBXh2Cn/txndPM1wO9OgT/KbOdqaRpZhtAb7xqfDPqfFTkysztwa/U+ajG8ZaFTWZbs8zXA705Dv4qs6155uuB3hwHP/vTCyUtctsA+uA545tR56MSz8Fvty7sM9tbZL4e6MXpfvxVZnus56MKp8HPvYJrxqyPCpwG/8GhzT8c2gA69VPw2zr/KbPNGeUOSvfSPbcPDu0uHNoAOvNS8D3qfModFO1vwW+a5sHylzVnPEwWJTv3eJEHh7Y/OrQBdOJc8L86tL2QNHFoB3D3YvCdyp2JcZKLQr32JLUHh/Y/ObQB9EfSTD4W0WMBfomkrUPwH6PHAZx666Gxfzq8x1w8aQ01kTRxmPGZ9VEfSbdO4Z9HjwW4mPxOcpn1URdJj07hX0aPBbiYpLlT8LfRYwF+iXyWNiXpc/RYgItJWjoFfyduVEFN5Dfr30ePBbiY/GZ9iUVN1ER+KzxbsW0ZtZDfCo8k3USPB7iY/GZ9iZIHtZA0dQz+VpQ8qIWkG8fw30aPB7iI0s7NnWP4l9FjAi4iaeEY/J14JAlqId8T3bWo91EDpRPdnWP4uaqLOki6dgy+xEY21EK+JY/EyS5qIP+SR+LiFmog31UeiZUe1EJ+N6cTftRD6cLWmvBjdJSezLAj/Bgd+d628hz+6HEBb5LvRjZJUvSYUC6lyXYZ3Q8z81/fjx4PyqSfK4xldH9cT3ajx4Iy6eWyehndL7eT3ehxoFxnIrOM7pdL+KPHgPKVGv6slZ7o/qMeJ9GZR/fn3eGP7jfqcxSfnUq4BvSe8Ef3GfWqOvzR/UX9qgt/dD8xLNWEP7qPGBaVsvXlrfBH9w/DohKWOA9eC39034BO6YWLXNF9AnrRhn9L8DE6OtnYFt0foFc6un83ui9Arw4nvdH9AHp3qPuj+wH0rq37ea4mxqmoiw8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAUKn/A0lwS+T3B6LKAAAAAElFTkSuQmCC",
];

const DELAYS_S = [0.00, 0.45, 0.90, 1.35, 1.80];
const ANIM_DURATION_S = 2.9;
// Full sequence: last delay + animation duration
const CYCLE_MS = (DELAYS_S[DELAYS_S.length - 1]! + ANIM_DURATION_S) * 1000; // ~4700ms

interface CapalifeLogoAnimProps {
  /** Width in px — height auto via 190:220 ratio */
  size?: number;
  /** Speed multiplier: 1 = original, 1.6 = faster (recommended for loading) */
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CapalifeLogoAnim({
  size = 32,
  speed = 1.6,
  className,
  style,
}: CapalifeLogoAnimProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animDuration = ANIM_DURATION_S / speed;
  const cycleDuration = CYCLE_MS / speed;

  // Restart animation on each cycle so it loops indefinitely
  useEffect(() => {
    const restart = () => {
      const el = containerRef.current;
      if (!el) return;
      const pieces = el.querySelectorAll<HTMLImageElement>("[data-clf-piece]");
      // Force animation reset
      pieces.forEach(p => { p.style.animation = "none"; });
      void el.offsetHeight; // trigger reflow
      pieces.forEach(p => { p.style.animation = ""; });
    };

    const id = setInterval(restart, cycleDuration);
    return () => clearInterval(id);
  }, [cycleDuration]);

  const height = Math.round(size * (220 / 190));

  return (
    <>
      <style>{`
        @keyframes clf-reveal {
          0%   { opacity: 0; transform: translateY(7px) scale(.990); }
          42%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-clf-piece] { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
      <div
        ref={containerRef}
        className={className}
        style={{ position: "relative", width: size, height, flexShrink: 0, ...style }}
      >
        {PIECE_SRCS.map((src, i) => (
          <img
            key={i}
            data-clf-piece={i}
            src={src}
            alt=""
            aria-hidden
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              opacity: 0,
              transform: "translateY(7px) scale(.990)",
              animation: `clf-reveal ${animDuration}s cubic-bezier(.22,.61,.36,1) ${DELAYS_S[i]! / speed}s forwards`,
              willChange: "opacity, transform",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        ))}
      </div>
    </>
  );
}
