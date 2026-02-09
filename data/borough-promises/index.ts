/**
 * Borough-level campaign commitments — Ensemble Montréal 2025 platform.
 *
 * Each file contains one borough's promises (borough-level + district-level).
 * Anjou and LaSalle are absent — they ran under independent local parties
 * (Équipe Anjou, Équipe LaSalle) allied with Ensemble Montréal.
 */

export { AHUNTSIC_CARTIERVILLE_PROMISES } from "./ahuntsic-cartierville";
export { CDNNDG_PROMISES } from "./cdnndg";
export { LACHINE_PROMISES } from "./lachine";
export { PLATEAU_MONT_ROYAL_PROMISES } from "./plateau-mont-royal";
export { LE_SUD_OUEST_PROMISES } from "./le-sud-ouest";
export { ILE_BIZARD_SAINTE_GENEVIEVE_PROMISES } from "./ile-bizard-sainte-genevieve";
export { MERCIER_HOCHELAGA_MAISONNEUVE_PROMISES } from "./mercier-hochelaga-maisonneuve";
export { MONTREAL_NORD_PROMISES } from "./montreal-nord";
export { OUTREMONT_PROMISES } from "./outremont";
export { PIERREFONDS_ROXBORO_PROMISES } from "./pierrefonds-roxboro";
export { RDP_PAT_PROMISES } from "./rdp-pat";
export { ROSEMONT_LA_PETITE_PATRIE_PROMISES } from "./rosemont-la-petite-patrie";
export { SAINT_LAURENT_PROMISES } from "./saint-laurent";
export { SAINT_LEONARD_PROMISES } from "./saint-leonard";
export { VERDUN_PROMISES } from "./verdun";
export { VILLE_MARIE_PROMISES } from "./ville-marie";
export { VILLERAY_SAINT_MICHEL_PARC_EXTENSION_PROMISES } from "./villeray-saint-michel-parc-extension";

import type { PromiseSeed } from "../promises-seed";
import { AHUNTSIC_CARTIERVILLE_PROMISES } from "./ahuntsic-cartierville";
import { CDNNDG_PROMISES } from "./cdnndg";
import { LACHINE_PROMISES } from "./lachine";
import { PLATEAU_MONT_ROYAL_PROMISES } from "./plateau-mont-royal";
import { LE_SUD_OUEST_PROMISES } from "./le-sud-ouest";
import { ILE_BIZARD_SAINTE_GENEVIEVE_PROMISES } from "./ile-bizard-sainte-genevieve";
import { MERCIER_HOCHELAGA_MAISONNEUVE_PROMISES } from "./mercier-hochelaga-maisonneuve";
import { MONTREAL_NORD_PROMISES } from "./montreal-nord";
import { OUTREMONT_PROMISES } from "./outremont";
import { PIERREFONDS_ROXBORO_PROMISES } from "./pierrefonds-roxboro";
import { RDP_PAT_PROMISES } from "./rdp-pat";
import { ROSEMONT_LA_PETITE_PATRIE_PROMISES } from "./rosemont-la-petite-patrie";
import { SAINT_LAURENT_PROMISES } from "./saint-laurent";
import { SAINT_LEONARD_PROMISES } from "./saint-leonard";
import { VERDUN_PROMISES } from "./verdun";
import { VILLE_MARIE_PROMISES } from "./ville-marie";
import { VILLERAY_SAINT_MICHEL_PARC_EXTENSION_PROMISES } from "./villeray-saint-michel-parc-extension";

export const ALL_BOROUGH_PROMISES: PromiseSeed[] = [
  ...AHUNTSIC_CARTIERVILLE_PROMISES,
  ...CDNNDG_PROMISES,
  ...LACHINE_PROMISES,
  ...PLATEAU_MONT_ROYAL_PROMISES,
  ...LE_SUD_OUEST_PROMISES,
  ...ILE_BIZARD_SAINTE_GENEVIEVE_PROMISES,
  ...MERCIER_HOCHELAGA_MAISONNEUVE_PROMISES,
  ...MONTREAL_NORD_PROMISES,
  ...OUTREMONT_PROMISES,
  ...PIERREFONDS_ROXBORO_PROMISES,
  ...RDP_PAT_PROMISES,
  ...ROSEMONT_LA_PETITE_PATRIE_PROMISES,
  ...SAINT_LAURENT_PROMISES,
  ...SAINT_LEONARD_PROMISES,
  ...VERDUN_PROMISES,
  ...VILLE_MARIE_PROMISES,
  ...VILLERAY_SAINT_MICHEL_PARC_EXTENSION_PROMISES,
];
