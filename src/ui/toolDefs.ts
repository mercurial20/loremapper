/** Toolbar tool definitions (name, shortcut, icon, help text). */
import { Eraser, Hand, MousePointer2, Ruler, Shapes, Type } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { ToolId } from '../store/editorStore';
import {
  BiomeIcon,
  FlattenIcon,
  FogIcon,
  LowerIcon,
  PeakIcon,
  RaiseIcon,
  RidgeIcon,
  RiverIcon,
  RoadIcon,
  SmoothIcon,
  TerritoryIcon,
} from './icons';

export interface ToolDef {
  id: ToolId;
  name: string;
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  help: string;
}

export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', name: 'Select & edit', key: 'V', icon: MousePointer2, help: 'Select, move, rotate and scale. Double-click a path/border to add a point, Alt-click to delete one.' },
    { id: 'pan', name: 'Pan', key: 'H', icon: Hand, help: 'Drag to move the view. Space, middle or right mouse also pan.' },
  ],
  [
    { id: 'raise', name: 'Raise terrain', key: 'R', icon: RaiseIcon, help: 'Paint to raise land. Hold still to keep building. Shift/Alt lowers.' },
    { id: 'lower', name: 'Lower terrain', key: 'L', icon: LowerIcon, help: 'Paint to lower land or carve seas. Shift/Alt raises.' },
    { id: 'ridge', name: 'Mountain ranges', key: 'M', icon: RidgeIcon, help: 'Drag along a line to build a jagged mountain range with summits and spurs.' },
    { id: 'smooth', name: 'Smooth', key: 'S', icon: SmoothIcon, help: 'Soften slopes and blend elevations.' },
    { id: 'flatten', name: 'Flatten', key: 'F', icon: FlattenIcon, help: 'Level terrain to the height under the first click, or to a fixed height.' },
  ],
  [
    { id: 'paint', name: 'Paint biome', key: 'B', icon: BiomeIcon, help: 'Paint forests, grassland, farmland, desert, swamp, snow, rock or steppe. Keys 1–8 pick a biome. Shift/Alt erases.' },
    { id: 'erase', name: 'Eraser', key: 'E', icon: Eraser, help: 'Erase painted biomes and (optionally) objects, path points and labels under the brush.' },
  ],
  [
    { id: 'river', name: 'River', key: 'W', icon: RiverIcon, help: 'Drag to draw freehand, or click points and double-click / Enter to finish.' },
    { id: 'road', name: 'Road', key: 'D', icon: RoadIcon, help: 'Drag to draw freehand, or click points and double-click / Enter to finish.' },
    { id: 'object', name: 'Place objects', key: 'O', icon: Shapes, help: 'Click to place the selected asset, or switch to stamp mode and drag.' },
    { id: 'label', name: 'Label', key: 'T', icon: Type, help: 'Click to add a text label. Click a label to edit it.' },
    { id: 'territory', name: 'Territory', key: 'G', icon: TerritoryIcon, help: 'Draw a realm: drag a lasso, or click corners and click the first point / Enter to close.' },
  ],
  [
    { id: 'fog', name: 'Fog of war', key: 'X', icon: FogIcon, help: 'Paint fog to hide areas, or switch to reveal. Shift/Alt inverts.' },
    { id: 'peak', name: 'Peaks', key: 'P', icon: PeakIcon, help: 'Click a summit to name it, click elsewhere on land to designate one, Alt-click to remove.' },
    { id: 'measure', name: 'Measure distance', key: 'U', icon: Ruler, help: 'Click points to measure great-circle distances. Double-click / Enter to finish, Esc to clear.' },
  ],
];

export const ALL_TOOLS = TOOL_GROUPS.flat();
