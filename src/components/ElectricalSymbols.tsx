import React from 'react';

export interface ElectricalSymbolCatalogItem {
  id: string;
  label: string;
  shortLabel: string;
}

export const ELECTRICAL_SYMBOL_OPTIONS: ElectricalSymbolCatalogItem[] = [
  {
    id: 'suis_tarik',
    label: 'Suis Tarik (Pull Switch)',
    shortLabel: 'Suis Tarik',
  },
  {
    id: 'suis_satu_hala',
    label: 'Suis Satu Hala (1-Way Switch)',
    shortLabel: 'Suis 1 Hala',
  },
  {
    id: 'lampu_pendarflour_dinding',
    label: 'Lampu Pendarflour Dinding',
    shortLabel: 'Pendarflour Dinding',
  },
  {
    id: 'alat_atur_kipas',
    label: 'Alat Atur Kipas (Fan Regulator)',
    shortLabel: 'Alat Atur Kipas',
  },
  {
    id: 'lampu_pendarflour_bulat',
    label: 'Lampu Pendarflour Bulat',
    shortLabel: 'Pendarflour Bulat',
  },
  {
    id: 'kipas_siling',
    label: 'Kipas Siling (Ceiling Fan)',
    shortLabel: 'Kipas Siling',
  },
  {
    id: 'soket_13a',
    label: 'Soket Alir Keluar 13A',
    shortLabel: 'Soket 13A',
  },
  {
    id: 'lampu_glob',
    label: 'Lampu Glob (Globe Lamp)',
    shortLabel: 'Lampu Glob',
  },
];

export function getSymbolLabelById(symbolId: string): string {
  const found = ELECTRICAL_SYMBOL_OPTIONS.find((item) => item.id === symbolId);
  return found ? found.label : symbolId;
}

interface ElectricalSymbolSvgProps {
  symbolId: string;
  className?: string;
}

export function ElectricalSymbolSvg({
  symbolId,
  className = 'w-12 h-10 text-black',
}: ElectricalSymbolSvgProps) {
  switch (symbolId) {
    // KT2 Q2 options: Wall Fan & Exhaust Fan variations
    case 'wall_fan_a':
      return (
        <svg viewBox="0 0 80 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Filled bowtie blades */}
          <polygon points="10,12 32,24 10,36" fill="currentColor" />
          <polygon points="54,12 32,24 54,36" fill="currentColor" />
          {/* Stem to wall T-bracket */}
          <line x1="54" y1="24" x2="68" y2="24" />
          <line x1="68" y1="10" x2="68" y2="38" strokeWidth="3" />
        </svg>
      );

    case 'wall_fan_b':
      return (
        <svg viewBox="0 0 80 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Outline bowtie blades (Standard MS IEC wall fan) */}
          <polygon points="10,12 32,24 10,36" />
          <polygon points="54,12 32,24 54,36" />
          {/* Stem to wall T-bracket */}
          <line x1="54" y1="24" x2="68" y2="24" />
          <line x1="68" y1="10" x2="68" y2="38" strokeWidth="3" />
        </svg>
      );

    case 'wall_fan_c':
      return (
        <svg viewBox="0 0 80 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Filled bowtie blades + right exhaust arrow */}
          <polygon points="10,12 32,24 10,36" fill="currentColor" />
          <polygon points="54,12 32,24 54,36" fill="currentColor" />
          <line x1="54" y1="24" x2="70" y2="24" />
          <polyline points="63,18 71,24 63,30" />
        </svg>
      );

    case 'wall_fan_d':
      return (
        <svg viewBox="0 0 80 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Outline bowtie blades + right exhaust arrow */}
          <polygon points="10,12 32,24 10,36" />
          <polygon points="54,12 32,24 54,36" />
          <line x1="54" y1="24" x2="70" y2="24" />
          <polyline points="63,18 71,24 63,30" />
        </svg>
      );

    // KT2 Q11 Palette (MS IEC 60364 / JPK Standard Electrical Symbols)
    case 'suis_tarik':
      return (
        <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="20" cy="30" r="6" />
          <line x1="25" y1="26" x2="43" y2="11" />
          <polyline points="38,9 43,11 42,16" />
          {/* Pull cord hanging from switch lever */}
          <line x1="36" y1="17" x2="36" y2="37" strokeDasharray="2.5 2.5" />
          <circle cx="36" cy="40" r="2.2" fill="currentColor" />
        </svg>
      );

    case 'suis_satu_hala':
      return (
        <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="20" cy="34" r="6" />
          <line x1="24.5" y1="29.5" x2="44" y2="11" />
          <line x1="44" y1="11" x2="49" y2="15" />
        </svg>
      );

    case 'lampu_pendarflour_dinding':
      return (
        <svg viewBox="0 0 80 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Wall line on left */}
          <line x1="12" y1="8" x2="12" y2="40" strokeWidth="3" />
          {/* Mounting stem */}
          <line x1="12" y1="24" x2="26" y2="24" />
          {/* Fluorescent tube horizontal bar with double end-caps */}
          <line x1="26" y1="16" x2="26" y2="32" />
          <line x1="26" y1="24" x2="66" y2="24" />
          <line x1="66" y1="16" x2="66" y2="32" />
        </svg>
      );

    case 'alat_atur_kipas':
      return (
        <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="16" y="8" width="32" height="32" />
          <line x1="16" y1="40" x2="48" y2="8" />
          <polyline points="40,8 48,8 48,16" />
          <circle cx="32" cy="24" r="5" fill="white" />
        </svg>
      );

    case 'lampu_pendarflour_bulat':
      return (
        <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="32" cy="24" r="16" />
          <circle cx="32" cy="24" r="9" />
          <line x1="28" y1="8" x2="28" y2="15" />
          <line x1="36" y1="8" x2="36" y2="15" />
        </svg>
      );

    case 'kipas_siling':
      return (
        <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="32" cy="24" r="4" />
          <path d="M28 24 C20 14, 12 18, 12 24 C12 30, 20 34, 28 24 Z" />
          <path d="M36 24 C44 14, 52 18, 52 24 C52 30, 44 34, 36 24 Z" />
        </svg>
      );

    case 'soket_13a':
      return (
        <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="34" x2="52" y2="34" />
          <path d="M 18 34 A 14 14 0 0 1 46 34" />
          <line x1="32" y1="10" x2="32" y2="20" />
        </svg>
      );

    case 'lampu_glob':
    default:
      return (
        <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="32" cy="24" r="14" />
        </svg>
      );
  }
}
