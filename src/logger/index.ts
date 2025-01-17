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
        this.error(args.join(' '));
    }

    public logInfo(...args: unknown[]): void {
        this.info(args.join(' '));
    }

    public logSuccess(...args: unknown[]): void {
        this.success(args.join(' '));
    }
}

export const tgAgenticRagLogger = new TgAgenticRagLogger();

export default tgAgenticRagLogger;