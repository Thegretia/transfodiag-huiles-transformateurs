import React from 'react';
import type { AnalyseHistoryItem } from '../types';

interface DuvalTriangleProps {
  history: AnalyseHistoryItem[];
  selectedAnalyseId: string | null;
  onSelectAnalyse: (item: AnalyseHistoryItem) => void;
}

// Conversion coordonnées ternaires (%CH4, %C2H4, %C2H2) -> SVG (x, y)
// Sommet Supérieur : 100% CH4 | Sommet Inférieur Droit : 100% C2H4 | Sommet Inférieur Gauche : 100% C2H2
const X0 = 75;
const Y0 = 330;
const SIDE = 310;
const SQRT3_2 = Math.sqrt(3) / 2;

function toSvgCoords(pctCh4: number, pctC2h4: number, _pctC2h2: number): [number, number] {
  const fCh4 = pctCh4 / 100;
  const fC2h4 = pctC2h4 / 100;
  const x = X0 + SIDE * (fC2h4 + 0.5 * fCh4);
  const y = Y0 - SIDE * SQRT3_2 * fCh4;
  return [x, y];
}

function polyPoints(pts: Array<[number, number, number]>): string {
  return pts
    .map(([c1, c2, c3]) => {
      const [x, y] = toSvgCoords(c1, c2, c3);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const DUVAL_ZONES: Array<{
  code: string;
  name: string;
  color: string;
  vertices: Array<[number, number, number]>;
  labelPos: [number, number, number];
}> = [
  {
    code: 'PD',
    name: 'Décharges Partielles (PD)',
    color: 'rgba(56, 189, 248, 0.35)',
    vertices: [
      [98, 2, 0],
      [100, 0, 0],
      [98, 0, 2],
    ],
    labelPos: [98.5, 0.8, 0.7],
  },
  {
    code: 'T1',
    name: 'Défaut Thermique < 300 °C (T1)',
    color: 'rgba(250, 204, 21, 0.30)',
    vertices: [
      [98, 2, 0],
      [80, 20, 0],
      [76, 20, 4],
      [96, 0, 4],
      [98, 0, 2],
    ],
    labelPos: [87, 11, 2],
  },
  {
    code: 'T2',
    name: 'Défaut Thermique 300-700 °C (T2)',
    color: 'rgba(251, 146, 60, 0.35)',
    vertices: [
      [80, 20, 0],
      [50, 50, 0],
      [46, 50, 4],
      [76, 20, 4],
    ],
    labelPos: [63, 35, 2],
  },
  {
    code: 'T3',
    name: 'Défaut Thermique > 700 °C (T3)',
    color: 'rgba(239, 68, 68, 0.38)',
    vertices: [
      [50, 50, 0],
      [0, 100, 0],
      [0, 85, 15],
      [35, 50, 15],
    ],
    labelPos: [20, 72, 8],
  },
  {
    code: 'D1',
    name: 'Décharges de Faible Énergie (D1)',
    color: 'rgba(99, 102, 241, 0.34)',
    vertices: [
      [87, 0, 13],
      [64, 23, 13],
      [0, 23, 77],
      [0, 0, 100],
    ],
    labelPos: [35, 10, 55],
  },
  {
    code: 'D2',
    name: 'Arcs de Haute Énergie (D2)',
    color: 'rgba(168, 85, 247, 0.36)',
    vertices: [
      [64, 23, 13],
      [47, 40, 13],
      [31, 40, 29],
      [0, 71, 29],
      [0, 23, 77],
    ],
    labelPos: [22, 38, 40],
  },
  {
    code: 'DT',
    name: 'Défaut Mixte Électrique & Thermique (DT)',
    color: 'rgba(236, 72, 153, 0.32)',
    vertices: [
      [96, 0, 4],
      [76, 20, 4],
      [46, 50, 4],
      [35, 50, 15],
      [0, 85, 15],
      [0, 71, 29],
      [31, 40, 29],
      [47, 40, 13],
      [87, 0, 13],
    ],
    labelPos: [55, 34, 11],
  },
];

export const DuvalTriangle: React.FC<DuvalTriangleProps> = ({
  history,
  selectedAnalyseId,
  onSelectAnalyse,
}) => {
  // Filtrer les prélèvements disposant de coordonnées Duval valides
  const dgaItems = history.filter((item) => {
    const gd = item.gaz_dissous;
    if (!gd) return false;
    const sum = (gd.ch4 || 0) + (gd.c2h4 || 0) + (gd.c2h2 || 0);
    return sum > 0;
  });

  const topVertex = toSvgCoords(100, 0, 0);
  const rightVertex = toSvgCoords(0, 100, 0);
  const leftVertex = toSvgCoords(0, 0, 100);

  const selectedItem =
    dgaItems.find((i) => i.id_analyse === selectedAnalyseId) || dgaItems[0] || null;

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-center">
      <div className="relative w-full max-w-[460px]">
        <svg viewBox="0 0 460 375" className="w-full h-auto select-none">
          {/* Fond des 7 zones géométriques CEI 60599 */}
          {DUVAL_ZONES.map((z) => {
            const [lx, ly] = toSvgCoords(z.labelPos[0], z.labelPos[1], z.labelPos[2]);
            return (
              <g key={z.code}>
                <polygon
                  points={polyPoints(z.vertices)}
                  fill={z.color}
                  stroke="#475569"
                  strokeWidth="1.2"
                >
                  <title>{z.name}</title>
                </polygon>
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-100 font-bold text-[11px] pointer-events-none drop-shadow"
                >
                  {z.code}
                </text>
              </g>
            );
          })}

          {/* Graduations sur les 3 côtés (20%, 40%, 60%, 80%) */}
          {[20, 40, 60, 80].map((tick) => {
            const [xCh4, yCh4] = toSvgCoords(tick, 0, 100 - tick);
            const [xC2h4, yC2h4] = toSvgCoords(100 - tick, tick, 0);
            const [xC2h2, yC2h2] = toSvgCoords(0, 100 - tick, tick);
            return (
              <g key={tick} className="fill-slate-400 text-[9px]">
                <text x={xCh4 - 16} y={yCh4} textAnchor="end">
                  {tick}%
                </text>
                <text x={xC2h4 + 14} y={yC2h4} textAnchor="start">
                  {tick}%
                </text>
                <text x={xC2h2} y={yC2h2 + 15} textAnchor="middle">
                  {tick}%
                </text>
              </g>
            );
          })}

          {/* Libellés des 3 sommets */}
          <text
            x={topVertex[0]}
            y={topVertex[1] - 14}
            textAnchor="middle"
            className="fill-sky-300 font-bold text-xs"
          >
            100% CH₄ (Méthane)
          </text>
          <text
            x={rightVertex[0] + 10}
            y={rightVertex[1] + 28}
            textAnchor="end"
            className="fill-amber-300 font-bold text-xs"
          >
            100% C₂H₄ (Éthylène)
          </text>
          <text
            x={leftVertex[0] - 10}
            y={leftVertex[1] + 28}
            textAnchor="start"
            className="fill-rose-400 font-bold text-xs"
          >
            100% C₂H₂ (Acétylène)
          </text>

          {/* Points d'analyses cliquables */}
          {dgaItems.map((item, idx) => {
            const gd = item.gaz_dissous!;
            const total = (gd.ch4 || 0) + (gd.c2h4 || 0) + (gd.c2h2 || 0);
            const pCh4 = ((gd.ch4 || 0) / total) * 100;
            const pC2h4 = ((gd.c2h4 || 0) / total) * 100;
            const pC2h2 = ((gd.c2h2 || 0) / total) * 100;
            const [cx, cy] = toSvgCoords(pCh4, pC2h4, pC2h2);
            const isSelected = selectedItem?.id_analyse === item.id_analyse;
            const isLatest = idx === 0;

            return (
              <g
                key={item.id_analyse}
                className="cursor-pointer transition-transform"
                onClick={() => onSelectAnalyse(item)}
              >
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={12}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2.2"
                    strokeDasharray="3 2"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 6.5 : isLatest ? 5.5 : 4.2}
                  fill={isSelected ? '#ef4444' : isLatest ? '#f59e0b' : '#e2e8f0'}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                >
                  <title>
                    {`${item.date_prelevement.slice(0, 10)} — Zone ${item.diagnostic?.code_duval || ''} | CH4:${gd.ch4} C2H4:${gd.c2h4} C2H2:${gd.c2h2} ppm`}
                  </title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Panneau interactif du point sélectionné */}
      <div className="w-full lg:w-72 bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-blue-400">
          Point d&apos;Analyse Sélectionné (Clic SVG)
        </div>
        {selectedItem && selectedItem.gaz_dissous ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs text-slate-400">Date Prélèvement</span>
              <span className="text-sm font-bold text-white">
                {selectedItem.date_prelevement.slice(0, 10)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs text-slate-400">Zone Identifiée</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                {selectedItem.diagnostic?.code_duval || selectedItem.duval_coordinates?.code_duval || 'N/A'}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
              {selectedItem.diagnostic?.diagnostic_duval ||
                selectedItem.duval_coordinates?.diagnostic_duval}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="text-[10px] text-sky-400 font-semibold">%CH₄</div>
                <div className="text-sm font-bold text-white">
                  {selectedItem.duval_coordinates?.pct_ch4?.toFixed(1) ?? '-'}%
                </div>
                <div className="text-[10px] text-slate-400">
                  {selectedItem.gaz_dissous.ch4 ?? 0} ppm
                </div>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="text-[10px] text-amber-400 font-semibold">%C₂H₄</div>
                <div className="text-sm font-bold text-white">
                  {selectedItem.duval_coordinates?.pct_c2h4?.toFixed(1) ?? '-'}%
                </div>
                <div className="text-[10px] text-slate-400">
                  {selectedItem.gaz_dissous.c2h4 ?? 0} ppm
                </div>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="text-[10px] text-rose-400 font-semibold">%C₂H₂</div>
                <div className="text-sm font-bold text-white">
                  {selectedItem.duval_coordinates?.pct_c2h2?.toFixed(1) ?? '-'}%
                </div>
                <div className="text-[10px] text-slate-400">
                  {selectedItem.gaz_dissous.c2h2 ?? 0} ppm
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 pt-1">
              Cliquez sur n&apos;importe quel point du triangle pour inspecter son historique DGA.
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-400 py-6 text-center">
            Aucune mesure DGA (CH₄, C₂H₄, C₂H₂) disponible pour cet équipement.
          </div>
        )}
      </div>
    </div>
  );
};
