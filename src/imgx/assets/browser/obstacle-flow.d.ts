export type ObstacleFlowRuntime = {
  layoutBlocks(
    blocks: any[],
    width: number,
    height: number,
    bodyImages: any[],
  ): void;
  paginateBlocks(
    blocks: any[],
    width: number,
    height: number,
    bodyImages: any[],
    options?: {
      pageImageLimit?: number;
      pageImageGroups?: any[][] | null;
    },
  ): any[];
};

export function createObstacleFlowRuntime(options: {
  prepareWithSegments: (...args: any[]) => any;
  layoutNextLineRange: (...args: any[]) => any;
  materializeLineRange: (...args: any[]) => { text: string };
  obstacleGap: number;
  minSlotWidth: number;
  renderLine: (...args: any[]) => void;
  renderImage: (...args: any[]) => void;
}): ObstacleFlowRuntime;
