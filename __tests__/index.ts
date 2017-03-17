import { Router, DynamicRedirect, RouterError, RawRoute, Action, ActionOptions, Context } from '../src/index';

const routes: Array<RawRoute> = [
    {
        path: '/lalala/:param',
        action(options: ActionOptions) {
            return 'lalala' + '/' + options.params['param'] + options.location.search;
        }
    },
    {
        path: '/',
        async action(next: Action, options: ActionOptions) {
            // options.ctx.set('mProp', true);
            return await next(options);
        },
        childs: [
            {
                path: 'home',
                custom: true,
                action() {
                    return 'Home sweet home!';
                }
            },
            {
                path: '/news',
                action(next: Action, options: ActionOptions) {
                    return next(options);
                },
                childs: [
                    {
                        path: '/',
                        action() {
                            return '/news'
                        }
                    },
                    {
                        path: 'item',
                        action() {
                            return '/news/item';
                        }
                    }
                ]
            },
            {
                path: 'redirect',
                to: '/home'
            },
            {
                path: 'redirect-to-redirect',
                to: '/redirect'
            },
            {
                path: 'redirect1',
                to: '/redirect2'
            },
            {
                path: 'redirect2',
                to: '/redirect1'
            },
            {
                path: 'dynamic-redirect',
                action() {
                    return new DynamicRedirect('/home');
                }
            },
            {
                path: 'dynamic-redirect-to-redirect',
                action() {
                    return new DynamicRedirect('/dynamic-redirect');
                }
            },
            {
                path: 'dynamic-redirect1',
                action() {
                    return new DynamicRedirect('/dynamic-redirect2');
                }
            },
            {
                path: 'dynamic-redirect2',
                action() {
                    return new DynamicRedirect('/dynamic-redirect1');
                }
            },
            {
                path: 'redirect-middleware',
                action() {
                    return new DynamicRedirect('/home');
                },
                childs: [
                    {
                        path: 'child1',
                        action() {
                            return 'Yo'
                        }
                    },
                    {
                        path: 'child2',
                        action() {
                            return 'Hi';
                        }
                    }
                ]
            },
            {
                path: 'error',
                action() {
                    return new RouterError();
                }
            },
            {
                path: 'error-middleware',
                action() {
                    return new RouterError('Access Forbidden', 403);
                },
                childs: [
                    {
                        path: 'child1',
                        action() {
                            return 'Yo'
                        }
                    },
                    {
                        path: 'child2',
                        action() {
                            return 'Hi';
                        }
                    }
                ]
            },
            {
                path: 'delayed',
                async action() {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return 'delayed result';
                }
            }
        ]
    }
];

const hooks = [
    {
        start: ({ ctx }: { ctx: Context }) => { ctx.set('startHook', true); },
        match: ({ ctx }: { ctx: Context }) => {
            ctx.set('matchHook', true);
            if (ctx.get('error') === true) {
                return new RouterError('Hook Error', 500);
            }
        },
        resolve: ({ ctx }: { ctx: Context }) => { ctx.set('resolveHook', true); }
    }
];

//TODO: test all params from router result in each test

it('test children', async () => {
    const router = new Router({ routes, hooks });
    const { result } = await router.run({ path: '/home' });
    expect(result).toBe('Home sweet home!');
});

it('test children level 2', async () => {
    const router = new Router({ routes, hooks });
    const { result } = await router.run({ path: '/news/item' });
    expect(result).toBe('/news/item');
});

it('test params', async () => {
    const router = new Router({ routes, hooks });
    const { result } = await router.run({ path: '/lalala/param' });
    expect(result).toBe('lalala/param');
});

it('test query', async () => {
    const router = new Router({ routes, hooks });
    const { result } = await router.run({ path: '/lalala/param?id=1' });
    expect(result).toBe('lalala/param?id=1');
});

it('test not found url', async () => {
    const router = new Router({ routes, hooks });
    const { error } = await router.run({ path: '/not-found' });
    expect(error).toEqual({
        message: 'Not Found',
        status: 404
    });
});

// Redirects:
// static
it('test simple static redirect', async () => {
    const router = new Router({ routes, hooks });
    const { result } = await router.run({ path: '/redirect' });
    expect(result).toBe('Home sweet home!');
});
it('test 2 level static redirect', async () => {
    const router = new Router({ routes, hooks });
    const { result } = await router.run({ path: '/redirect-to-redirect' });
    expect(result).toBe('Home sweet home!');
});
it('test static circular redirect', async () => {
    const router = new Router({ routes, hooks });
    const { error } = await router.run({ path: '/redirect1' });
    expect(error).toEqual({
        message: 'Circular Redirect',
        status: 500
    });
});
it('test correct static redirect status codes', async () => {
    const router = new Router({ routes, hooks });
    const { status } = await router.run({ path: '/redirect-to-redirect' });
    expect(status === 301 || status === 302).toBe(true);
});
// dynamic
it('test dynamic redirect', async () => {
    const router = new Router({ routes, hooks });
    const { result, error } = await router.run({ path: '/dynamic-redirect' });
    expect(result).toBe('Home sweet home!');
});
it('test 2 level dynamic redirect', async () => {
    const router = new Router({ routes, hooks });
    const { result } = await router.run({ path: '/dynamic-redirect-to-redirect' });
    expect(result).toBe('Home sweet home!');
});
it('test dynamic circular redirect', async () => {
    const router = new Router({ routes, hooks });
    const { error } = await router.run({ path: '/dynamic-redirect1' });
    expect(error).toEqual({
        message: 'Circular Redirect',
        status: 500
    });
});
it('test correct dynamic redirect status codes', async () => {
    const router = new Router({ routes, hooks });
    const { status, result } = await router.run({ path: '/dynamic-redirect-to-redirect' });
    expect(status === 301 || status === 302).toBe(true);
});
it('test dynamic redirect in middleware', async () => {
    const router = new Router({ routes, hooks });
    expect.assertions(2);
    const { result: result1 } = await router.run({ path: '/redirect-middleware/child1' });
    expect(result1).toBe('Home sweet home!');
    const { result: result2 } = await router.run({ path: '/redirect-middleware/child2' });
    expect(result2).toBe('Home sweet home!');
});

// Errors:
it('test router error in action', async () => {
    const router = new Router({ routes, hooks });
    const { error } = await router.run({ path: '/error' });
    expect(error).toEqual({
        message: 'Internal Error',
        status: 500
    });
});
it('test router error in middleware', async () => {
    const router = new Router({ routes, hooks });
    expect.assertions(2);
    const { error: error1 } = await router.run({ path: '/error-middleware/child1' });
    expect(error1).toEqual({
        message: 'Access Forbidden',
        status: 403
    });
    const { error: error2 } = await router.run({ path: '/error-middleware/child2' });
    expect(error2).toEqual({
        message: 'Access Forbidden',
        status: 403
    });
});
it('test router error in hook', async () => {
    const router = new Router({ routes, hooks });
    const ctx = new Context;
    ctx.set('error', true);
    const { error } = await router.run({ path: '/home', ctx });
    expect(error).toEqual({
        message: 'Hook Error',
        status: 500
    });
});

// Hooks
it('test run with hooks', async () => {
    const router = new Router({ routes, hooks });
    const { ctx } = await router.run({ path: '/home' });
    expect.assertions(3);
    expect(ctx.get('startHook')).toBe(true);
    expect(ctx.get('matchHook')).toBe(true);
    expect(ctx.get('resolveHook')).toBe(true);
});
it('test resolve without hooks', async () => {
    const router = new Router({ routes, hooks });
    const { ctx } = await router.resolve({ path: '/home' });
    expect.assertions(3);
    expect(ctx.get('startHook')).toBe(null);
    expect(ctx.get('matchHook')).toBe(null);
    expect(ctx.get('resolveHook')).toBe(null);
});
it('test runHooks must return null', async () => {
    const router = new Router({ routes, hooks });
    const result = await router.runHooks('start', router.currentTransition);
    expect(result).toBe(null);
});
// TODO: test that options/params in hooks always have ctx


it('test router run in parallel not allowed', () => {
    const router = new Router({ routes, hooks });
    expect.assertions(2);
    return Promise.all([
        router.run({ path: '/delayed' }).then(({ result }) => {
            expect(result).toBe('delayed result');
        }),
        router.run({ path: '/home' }).then(({ error }) => {
            expect(error).toEqual({
                message: 'Already running',
                status: 500
            });
        })
    ])
});
it('test router resolve in parallel not allowed', () => {
    const router = new Router({ routes, hooks });
    expect.assertions(2);
    return Promise.all([
        router.resolve({ path: '/delayed' }).then(({ result }) => {
            expect(result).toBe('delayed result');
        }),
        router.resolve({ path: '/home' }).then(({ error }) => {
            expect(error).toEqual({
                message: 'Already running',
                status: 500
            });
        })
    ])
});

it('test router cancellation of current transition', () => {
    const router = new Router({ routes, hooks });
    const promise = router.run({ path: '/delayed' }).then((result) => {
        expect(result.error).toEqual({
            message: 'Cancelled',
            status: 500
        });
    });
    router.cancel();
    return promise;
});
it('test router run after cancellation', () => {
    const router = new Router({ routes, hooks });
    expect.assertions(2);
    const promise1 = router.run({ path: '/delayed' }).then(({ error }) => {
        expect(error).toEqual({
            message: 'Cancelled',
            status: 500
        });
    });
    router.cancel();
    const promise2 = router.run({ path: '/home' }).then(({ result }) => {
        expect(result).toBe('Home sweet home!');
    });

    return Promise.all([
        promise1,
        promise2
    ]);
});
it('test cancel with hook', async () => {
    let cancel = false;
    const withCancel = [
        ...hooks,
        {
            cancel: () => {
                cancel = true;
            }
        }
    ];
    const router = new Router({ routes, hooks: withCancel });
    const promise = router.run({ path: '/delayed' }).then(() => {
        expect(cancel).toBe(true);
    });
    router.cancel();
    return promise;
});
it('test cancel without hook', async () => {
    let cancel = false;
    const withCancel = [
        ...hooks,
        {
            cancel: () => {
                cancel = true;
            }
        }
    ];
    const router = new Router({ routes, hooks: withCancel });
    const promise = router.run({ path: '/delayed' }).then(() => {
        expect(cancel).toBe(false);
    });
    router.cancel(false);
    return promise;
});
// TODO: test hook order execution after cancel

it('test custom field', async () => {
    const router = new Router({ routes, hooks });
    const { route } = await router.run({ path: '/home' });
    expect(route.custom).toBe(true);
});