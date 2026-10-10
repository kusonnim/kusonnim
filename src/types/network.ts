export interface Project {
  id: string;
  name: string;
  url: string;
  layer: number;
  row: number;
  preview: string;
  /** Screenshot focal point, normalized from zero to one. */
  focus?: { x: number; y: number };
}

export interface NeuronDefinition {
  id: string;
  layer: number;
  row: number;
  project?: Project;
}

export interface EdgeDefinition {
  id: string;
  source: string;
  target: string;
  layer: number;
}

export interface Point { x: number; y: number }

export interface NeuronState extends Point {
  definition: NeuronDefinition;
  base: Point;
  radius: number;
  expansion: number;
  charge: number;
  activation: number;
  pointerOffset: Point;
  stirOffset: Point;
  stirVelocity: Point;
  gravityOffset: Point;
  strandOffset: Point;
  displacement: Point;
}

export type Gesture = {
  pointerId: number;
  nodeId: string | null;
  started: number;
  origin: Point;
  lastPoint: Point;
  moved: boolean;
  mode?: 'pending' | 'gravity' | 'pan';
};

export type GestureResult = 'cancel' | 'pan' | 'background' | 'gravity' | 'charge' | 'activate';
