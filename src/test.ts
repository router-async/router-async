/*
import Router from './router';

const delay = () => new Promise(resolve => setTimeout(() => resolve(), 3000));

const routes = [
    {
        path: '/lalala/:param',
        action(options) {
            console.log('options', options);
            return 'lalalal'
        }
    },
    {
        path: '/',
        async action({ next }, options) {
            options.ctx.mProp = true;
            // console.log('/ options and route', options);
            // console.log('/ middleware', next(options));
            return await next(options);
            // return 'eba';
        },
        childs: [
            {
                path: '/:lang',
                async action(options) {
                    options.ctx.rProp = true;
                    // console.log('options', options);
                    await delay();
                    return 'ROOOOOOOOOT';
                }
            },
            {
                path: 'home',
                action() {
                    return 'Home sweet home!';
                }
            },
            {
                path: 'news',
                action({ next }, options) {
                    console.log('news middleware', next(options));
                    return next(options);
                    // return 'eba news';
                },
                childs: [
                    {
                        path: '/',
                        action() {
                            return '/ news'
                        }
                    },
                    {
                        path: 'item',
                        action(options) {
                            console.log('options', options);
                            return 'news/item';
                        }
                    },
                    {
                        path: 'archive',
                        action() {
                            return 'news/archive';
                        }
                    }
                ]
            }
        ]
    }
];

const firstHook = {
    start:   ({ path, ctx }) => { console.log('start 1', path, ctx); },
    // match:   () => { console.log('match 1'); },
    resolve: ({ ctx }) => { console.log('resolve 1', ctx); }
};
const secondHook = {
    start:   () => { console.log('start 2'); },
    match:   () => { console.log('match 2'); },
    resolve: () => { console.log('resolve 2'); }
};
const hooks = [firstHook, secondHook];

const router = new Router({ routes, hooks });

router.resolve({ path: '/ru', ctx: {iProp: true} }).then(result => {
    console.log(result);
}).catch(error => {
    console.log(error);
});
*/