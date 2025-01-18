import createDebug from 'debug';

class TgAgenticRagLogger {
    public debug = createDebug('bot:dev');
    public error = createDebug('bot:error');
    public info = createDebug('bot:info');
    public success = createDebug('bot:success');

    public log(...args: unknown[]): void {
        this.debug(args.join(' '));
    }

    public logError(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.error(args.join(' '));
        } else {
            console.error('❌', args.join(' '));
        }
    }

    public logInfo(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.info(args.join(' '));
        } else {
            console.log('ℹ️', args.join(' '));
        }
    }

    public logSuccess(...args: unknown[]): void {
        if (process.env.NODE_ENV === 'development') {
            this.success(args.join(' '));
        } else {
            console.log('✅', args.join(' '));
        }
    }
}

export const tgAgenticRagLogger = new TgAgenticRagLogger();

export default tgAgenticRagLogger;