/** Toolbar tool definitions (name, shortcut, icon, help text). */
import { Eraser, Hand, Info, MousePointer2, Ruler, Shapes, Type, Waves } from 'lucide-react';
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
import { N_ } from '../i18n/mark';

export interface ToolDef {
  id: ToolId;
  name: string;
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  help: string;
}

export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', name: N_('Select & edit'), key: 'V', icon: MousePointer2, help: N_('Select, move, rotate and scale. Double-click a path/border to add a point, Alt-click to delete one.') },
    { id: 'info', name: N_('Info'), key: 'I', icon: Info, help: N_('Point at land or water to see its name and size below the map; click for its card with area, coastline, highest point and realms. Drag to pan.') },
    { id: 'pan', name: N_('Pan'), key: 'H', icon: Hand, help: N_('Drag to move the view. Space, middle or right mouse also pan.') },
  ],
  [
    { id: 'raise', name: N_('Raise terrain'), key: 'R', icon: RaiseIcon, help: N_('Paint to raise land. Hold still to keep building. Shift/Alt lowers.') },
    { id: 'lower', name: N_('Lower terrain'), key: 'L', icon: LowerIcon, help: N_('Paint to lower land or carve seas. Shift/Alt raises.') },
    { id: 'ridge', name: N_('Mountain ranges'), key: 'M', icon: RidgeIcon, help: N_('Drag along a line to build a jagged mountain range with summits and spurs.') },
    { id: 'smooth', name: N_('Smooth'), key: 'S', icon: SmoothIcon, help: N_('Soften slopes and blend elevations.') },
    { id: 'flatten', name: N_('Flatten'), key: 'F', icon: FlattenIcon, help: N_('Level terrain to the height under the first click, or to a fixed height.') },
  ],
  [
    { id: 'paint', name: N_('Paint biome'), key: 'B', icon: BiomeIcon, help: N_('Paint forests, grassland, farmland, desert, swamp, snow, rock or steppe. Keys 1–8 pick a biome. Shift/Alt erases.') },
    { id: 'erase', name: N_('Eraser'), key: 'E', icon: Eraser, help: N_('Erase painted biomes and (optionally) objects, path points and labels under the brush.') },
  ],
  [
    { id: 'river', name: N_('River'), key: 'W', icon: RiverIcon, help: N_('Drag to draw a river freehand, or click points and double-click / Enter to finish. It tapers from source to mouth.') },
    { id: 'lake', name: N_('Lake'), key: 'K', icon: Waves, help: N_('Click a hollow to fill it with water up to where it would spill over, or paint a lake. Shift or Alt removes water.') },
    { id: 'road', name: N_('Road'), key: 'D', icon: RoadIcon, help: N_('Drag to draw freehand, or click points and double-click / Enter to finish.') },
    { id: 'object', name: N_('Place objects'), key: 'O', icon: Shapes, help: N_('Click to place the selected asset, or switch to stamp mode and drag.') },
    { id: 'label', name: N_('Label'), key: 'T', icon: Type, help: N_('Click to add a text label. Click a label to edit it.') },
    { id: 'territory', name: N_('Territory'), key: 'G', icon: TerritoryIcon, help: N_('Draw a realm: drag a lasso, or click corners and click the first point / Enter to close.') },
  ],
  [
    { id: 'fog', name: N_('Fog of war'), key: 'X', icon: FogIcon, help: N_('Paint fog to hide areas, or switch to reveal. Shift/Alt inverts.') },
    { id: 'peak', name: N_('Peaks'), key: 'P', icon: PeakIcon, help: N_('Click a summit to name it, click elsewhere on land to designate one, Alt-click to remove.') },
    { id: 'measure', name: N_('Measure distance'), key: 'U', icon: Ruler, help: N_('Click points to measure great-circle distances. Double-click / Enter to finish, Esc to clear.') },
  ],
];

export const ALL_TOOLS = TOOL_GROUPS.flat();
