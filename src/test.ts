import test from 'ava';

import { Router } from './index';

const routes = [
    {
        path: '/lalala/:param',
        action(options) {
            return 'lalala' + '/' + options.params.param;
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

test('test children', t => {
    return router.resolve({ path: '/home' }).then(result => {
        t.is(result.result, 'Home sweet home!');
    });
});

test('test children level 2', t => {
    return router.resolve({ path: '/news/item' }).then(result => {
        t.is(result.result, '/news/item');
    });
});

test('test params', t => {
    return router.resolve({ path: '/lalala/?id=1' }).then(result => {
        t.is(result.result, 'lalala/?id=1');
    });
});

test('test not found url', t => {
    return router.resolve({ path: '/test' }).catch(result => {
        t.deepEqual(result, {
            name: 'RouterError',
            message: 'Not Found',
            status: 404
        });
    });
});

