// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlaggedView } from './FlaggedView';

describe('FlaggedView', () => {
  it('should render the placeholder copy', () => {
    render(<FlaggedView />);
    expect(screen.getByText('No flagged photos yet')).toBeInTheDocument();
  });
});
