export interface IconSvgElement {
  tag: string;
  attrs: Record<string, string>;
}

export interface IconData {
  id: string;
  name: string;
  tags: string[];
  viewBox: string;
  elements: IconSvgElement[];
}

export interface IconIndexEntry {
  id: string;
  name: string;
  tags: string[];
  chunk: string;
}
