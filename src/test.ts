import test from 'ava';

import { Router } from './index';

const routes = [
    {
        path: '/lalala/:param',
        action(options) {
            return 'lalala' + '/' + options.params.param + options.location.search;
        }
    },
    {
        path: '/',
        async action(next, options) {
            options.ctx.mProp = true;
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
                action(next, options) {
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
        name: 'RouterError',
        message: 'Not Found',
        status: 404
    });
});
