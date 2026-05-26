import { describe, expect, it } from 'vitest';
import { completeImageJob, createImageJob, failImageJob } from './ImagePage';

describe('image generation local jobs', () => {
  it('keeps the prompt visible while a generation is pending', () => {
    const job = createImageJob('local-1', '一只月球上的橘猫', 'gpt-image', 'gpt-image / OpenAI');

    expect(job).toMatchObject({
      id: 'local-1',
      prompt: '一只月球上的橘猫',
      modelId: 'gpt-image',
      modelName: 'gpt-image / OpenAI',
      status: 'pending',
      images: [],
    });
  });

  it('updates the same job with generated image URLs and points', () => {
    const jobs = [createImageJob('local-1', '山水画', 'image-model', 'image-model / Provider')];
    const updated = completeImageJob(jobs, 'local-1', {
      id: 'img_1',
      model_id: 'image-model',
      image_urls: ['https://example.com/a.png'],
      points_cost: 10,
      status: 'ok',
    });

    expect(updated[0]).toMatchObject({
      status: 'ok',
      images: ['https://example.com/a.png'],
      pointsCost: 10,
    });
  });

  it('keeps a failed prompt in the stream with the error message', () => {
    const jobs = [createImageJob('local-1', '赛博城市', 'image-model', 'image-model / Provider')];
    const updated = failImageJob(jobs, 'local-1', '上游错误');

    expect(updated[0]).toMatchObject({
      prompt: '赛博城市',
      status: 'error',
      error: '上游错误',
    });
  });
});
