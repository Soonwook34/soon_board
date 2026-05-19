module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run preview -- --port=4173',
      startServerReadyPattern: 'Local:',
      url: ['http://localhost:4173/'],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.80 }],
        'categories:accessibility': ['error', { minScore: 0.90 }],
      },
    },
  },
}
