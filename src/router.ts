import * as pathToRegexp from 'path-to-regexp';

function trimSlashes(str) {
    return str.replace(/^\/|\/$/g,'');
}

function decodeParam(val) {
    if (val === undefined || val === '') {
        return val;
    }

    try {
        return decodeURIComponent(val);
    } catch (err) {
        return val;
    }
}

export default class Router {
    private routes: any;
    private hooks: any;
    constructor({ routes, hooks }) {
        this.routes = [];
        this.hooks = hooks;
        if (Array.isArray(routes)) {
            routes = { childs: routes };
        }
        this.walk(routes);
        // console.log(this.routes);
    }
    private walk(route, walkPath = []) {
        if (route.childs) {
            walkPath.push(route);
            for (const child of route.childs) {
                this.walk(child, walkPath);
            }
        } else {
            const fullWalkPath = [...walkPath, route];
            const middlewares = [];
            // concatenate full path
            let path = '';
            for (const step of fullWalkPath) {
                if (step.path) path += `/${trimSlashes(step.path)}`;
            }
            path = `/${trimSlashes(path)}`;
            const keys = [];
            const pattern = pathToRegexp(path, keys);
            // wrap action with middlewares
            let action = route.action;
            for (const step of walkPath) {
                if (step.action) middlewares.push(step.action);
            }
            if (middlewares.length) {
                for (const middleware of middlewares) {
                    action = middleware.bind(null, {next: action, route})
                }
            }
            // push result route
            this.routes.push({
                path,
                pattern,
                keys,
                action
            });
        }
    }
    private async runHooks(hook, options) {
        for (const hooks of this.hooks) {
            if (hooks[hook]) await hooks[hook](options);
        }
    }
    async resolve({ path, ctx = {} }) {
        await this.runHooks('start', { path, ctx });
        for (const route of this.routes) {
            const match = route.pattern.exec(path);
            if (match) {
                await this.runHooks('match', { ctx });
                let params = {};
                for (let i = 1; i < match.length; i += 1) {
                    params[route.keys[i - 1].name] = decodeParam(match[i]);
                }
                const resolved = await route.action({ path, ctx, keys: [...route.keys], params });
                await this.runHooks('resolve', { ctx });
                return resolved;
            }
        }
        throw 'Not Found';
    }
}