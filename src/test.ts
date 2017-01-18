import test from 'ava';

import { Router, Redirect, RouterError, RawRoute, Action, ActionOptions } from './index';

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
                    return new Redirect('/home');
                }
            },
            {
                path: 'dynamic-redirect-to-redirect',
                action() {
                    return new Redirect('/dynamic-redirect');
                }
            },
            {
                path: 'dynamic-redirect1',
                action() {
                    return new Redirect('/dynamic-redirect2');
                }
            },
            {
                path: 'dynamic-redirect2',
                action() {
                    return new Redirect('/dynamic-redirect1');
                }
            },
            {
                path: 'redirect-middleware',
                action() {
                    return new Redirect('/home');
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
            }
        ]
    }
];

const router = new Router({ routes });

test('test children', async t => {
    const { result } = await router.run({ path: '/home' });
    t.is(result, 'Home sweet home!');
});

test('test children level 2', async t => {
    const { result } = await router.run({ path: '/news/item' });
    t.is(result, '/news/item');
});

test('test params', async t => {
    const { result } = await router.run({ path: '/lalala/param' });
    t.is(result, 'lalala/param');
});

test('test query', async t => {
    const { result } = await router.run({ path: '/lalala/param?id=1' });
    t.is(result, 'lalala/param?id=1');
});

test('test not found url', async t => {
    const { error } = await router.run({ path: '/not-found' });
    t.deepEqual(error, {
        message: 'Not Found',
        status: 404
    });
});

// Redirects:
// static
test('test simple static redirect', async t => {
    const { result } = await router.run({ path: '/redirect' });
    t.is(result, 'Home sweet home!');
});
test('test 2 level static redirect', async t => {
    const { result } = await router.run({ path: '/redirect-to-redirect' });
    t.is(result, 'Home sweet home!');
});
test('test static circular redirect', async t => {
    const { error } = await router.run({ path: '/redirect1' });
    t.deepEqual(error, {
        message: 'Circular Redirect',
        status: 500
    });
});
test('test correct static redirect status codes', async t => {
    const { status } = await router.run({ path: '/redirect-to-redirect' });
    t.true(status === 301 || status === 302);
});
// dynamic
test('test dynamic redirect', async t => {
    const { result, error } = await router.run({ path: '/dynamic-redirect' });
    t.is(result, 'Home sweet home!');
});
test('test 2 level dynamic redirect', async t => {
    const { result } = await router.run({ path: '/dynamic-redirect-to-redirect' });
    t.is(result, 'Home sweet home!');
});
test('test dynamic circular redirect', async t => {
    const { error } = await router.run({ path: '/dynamic-redirect1' });
    t.deepEqual(error, {
        message: 'Circular Redirect',
        status: 500
    });
});
test('test correct dynamic redirect status codes', async t => {
    const { status } = await router.run({ path: '/dynamic-redirect-to-redirect' });
    t.true(status === 301 || status === 302);
});
test('test dynamic redirect in middleware', async t => {
    t.plan(2);
    const { result: result1 } = await router.run({ path: '/redirect-middleware/child1' });
    t.is(result1, 'Home sweet home!');
    const { result: result2 } = await router.run({ path: '/redirect-middleware/child2' });
    t.is(result2, 'Home sweet home!');
});

// Errors:
test('test simple router error', async t => {
    const { error } = await router.run({ path: '/error' });
    t.deepEqual(error, {
        message: 'Internal Error',
        status: 500
    });
});
test('test router error in middleware', async t => {
    t.plan(2);
    const { error: error1 } = await router.run({ path: '/error-middleware/child1' });
    t.deepEqual(error1, {
        message: 'Access Forbidden',
        status: 403
    });
    const { error: error2 } = await router.run({ path: '/error-middleware/child2' });
    t.deepEqual(error2, {
        message: 'Access Forbidden',
        status: 403
    });
});