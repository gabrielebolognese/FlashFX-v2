import type { AnchorEdge } from '../core/types';

export class AnchorGraph {
  private adjacency = new Map<string, Set<string>>();
  private edges: AnchorEdge[] = [];

  getEdges(): AnchorEdge[] {
    return this.edges;
  }

  getEdgeById(id: string): AnchorEdge | undefined {
    return this.edges.find((e) => e.id === id);
  }

  getEdgesFrom(layerId: string): AnchorEdge[] {
    return this.edges.filter((e) => e.sourceLayerId === layerId && e.enabled);
  }

  getEdgesTo(layerId: string): AnchorEdge[] {
    return this.edges.filter((e) => e.targetLayerId === layerId && e.enabled);
  }

  addEdge(edge: AnchorEdge): boolean {
    if (this.wouldCycle(edge.sourceLayerId, edge.targetLayerId)) {
      return false;
    }
    this.edges.push(edge);
    if (!this.adjacency.has(edge.sourceLayerId)) {
      this.adjacency.set(edge.sourceLayerId, new Set());
    }
    this.adjacency.get(edge.sourceLayerId)!.add(edge.targetLayerId);
    return true;
  }

  removeEdge(edgeId: string): void {
    const idx = this.edges.findIndex((e) => e.id === edgeId);
    if (idx < 0) return;
    const edge = this.edges[idx];
    this.edges.splice(idx, 1);
    this.rebuildAdjacency();
    void edge;
  }

  updateEdge(edgeId: string, updates: Partial<AnchorEdge>): void {
    const edge = this.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    Object.assign(edge, updates);
  }

  wouldCycle(source: string, target: string): boolean {
    if (source === target) return true;
    const visited = new Set<string>();
    const stack = [target];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === source) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      const neighbors = this.adjacency.get(node);
      if (neighbors) {
        for (const n of neighbors) stack.push(n);
      }
    }
    return false;
  }

  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const allNodes = new Set<string>();

    for (const edge of this.edges) {
      if (!edge.enabled) continue;
      allNodes.add(edge.sourceLayerId);
      allNodes.add(edge.targetLayerId);
    }

    for (const node of allNodes) {
      inDegree.set(node, 0);
    }

    for (const edge of this.edges) {
      if (!edge.enabled) continue;
      inDegree.set(edge.targetLayerId, (inDegree.get(edge.targetLayerId) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [node, deg] of inDegree) {
      if (deg === 0) queue.push(node);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const edge of this.edges) {
        if (!edge.enabled) continue;
        if (edge.sourceLayerId !== node) continue;
        const newDeg = (inDegree.get(edge.targetLayerId) ?? 1) - 1;
        inDegree.set(edge.targetLayerId, newDeg);
        if (newDeg === 0) queue.push(edge.targetLayerId);
      }
    }

    return sorted;
  }

  rebuild(edges: AnchorEdge[]): void {
    this.edges = [...edges];
    this.rebuildAdjacency();
  }

  private rebuildAdjacency(): void {
    this.adjacency.clear();
    for (const edge of this.edges) {
      if (!edge.enabled) continue;
      if (!this.adjacency.has(edge.sourceLayerId)) {
        this.adjacency.set(edge.sourceLayerId, new Set());
      }
      this.adjacency.get(edge.sourceLayerId)!.add(edge.targetLayerId);
    }
  }
}
