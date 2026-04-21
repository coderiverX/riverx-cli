/**
 * 贪吃蛇自动寻路脚本
 * 
 * 使用方法：
 * 1. 在浏览器中打开 snake.html
 * 2. 按 F12 打开开发者工具 -> Console
 * 3. 复制粘贴此文件内容并回车
 * 4. 输入 runAutoSnake() 启动自动游戏
 * 5. 输入 stopAutoSnake() 停止自动游戏
 */

(function () {
    // 防止重复注入
    if (window.autoSnakeRunning) {
        console.log('⚠️ 自动脚本已在运行中，请先调用 stopAutoSnake()');
        return;
    }

    const gridSize = 20;
    const tileCount = 20; // 400 / 20

    let autoInterval = null;

    // 获取游戏状态
    function getGameState() {
        const snake = window.snake;
        const food = window.food;
        return { snake, food };
    }

    // BFS 寻找最短路径
    function findPath(start, target, snake) {
        const queue = [{ pos: start, path: [] }];
        const visited = new Set();
        visited.add(`${start.x},${start.y}`);

        // 蛇身集合（用于碰撞检测）
        const snakeSet = new Set(snake.map(s => `${s.x},${s.y}`));
        // 蛇尾会移动，所以允许走到蛇尾位置
        const tail = snake[snake.length - 1];
        snakeSet.delete(`${tail.x},${tail.y}`);

        const directions = [
            { x: 0, y: -1 }, // 上
            { x: 0, y: 1 },  // 下
            { x: -1, y: 0 }, // 左
            { x: 1, y: 0 }   // 右
        ];

        while (queue.length > 0) {
            const { pos, path } = queue.shift();

            if (pos.x === target.x && pos.y === target.y) {
                return path;
            }

            for (const dir of directions) {
                const next = { x: pos.x + dir.x, y: pos.y + dir.y };
                const key = `${next.x},${next.y}`;

                if (
                    next.x >= 0 && next.x < tileCount &&
                    next.y >= 0 && next.y < tileCount &&
                    !visited.has(key) &&
                    !snakeSet.has(key)
                ) {
                    visited.add(key);
                    queue.push({ pos: next, path: [...path, dir] });
                }
            }
        }

        return null; // 无路可走
    }

    // 检查移动是否安全（不会立即死亡）
    function isSafeMove(direction, snake) {
        const head = snake[0];
        const next = { x: head.x + direction.x, y: head.y + direction.y };

        // 检查墙壁
        if (next.x < 0 || next.x >= tileCount || next.y < 0 || next.y >= tileCount) {
            return false;
        }

        // 检查蛇身（不包括蛇尾，因为蛇尾会移走）
        for (let i = 0; i < snake.length - 1; i++) {
            if (snake[i].x === next.x && snake[i].y === next.y) {
                return false;
            }
        }

        return true;
    }

    // 计算从某位置可以到达的空间大小（洪水填充）
    function countReachableSpace(startPos, snakeBody) {
        const queue = [startPos];
        const visited = new Set();
        visited.add(`${startPos.x},${startPos.y}`);

        const snakeSet = new Set(snakeBody.map(s => `${s.x},${s.y}`));
        // 模拟移动后蛇尾会空出
        const tail = snakeBody[snakeBody.length - 1];
        snakeSet.delete(`${tail.x},${tail.y}`);

        const directions = [
            { x: 0, y: -1 }, { x: 0, y: 1 },
            { x: -1, y: 0 }, { x: 1, y: 0 }
        ];

        let count = 0;
        const maxCheck = snakeBody.length + 10; // 至少要有蛇身长度的空间

        while (queue.length > 0 && count < maxCheck) {
            const pos = queue.shift();
            count++;

            for (const dir of directions) {
                const next = { x: pos.x + dir.x, y: pos.y + dir.y };
                const key = `${next.x},${next.y}`;

                if (
                    next.x >= 0 && next.x < tileCount &&
                    next.y >= 0 && next.y < tileCount &&
                    !visited.has(key) &&
                    !snakeSet.has(key)
                ) {
                    visited.add(key);
                    queue.push(next);
                }
            }
        }

        return count;
    }

    // 模拟移动后的蛇身
    function simulateMove(snake, direction) {
        const head = snake[0];
        const newHead = { x: head.x + direction.x, y: head.y + direction.y };
        const newSnake = [newHead, ...snake];
        newSnake.pop(); // 移除尾部
        return newSnake;
    }

    // 获取最佳移动方向
    function getBestMove() {
        const { snake, food } = getGameState();
        if (!snake || !food) return null;

        const head = snake[0];
        const directions = [
            { x: 0, y: -1, name: 'ArrowUp' },
            { x: 0, y: 1, name: 'ArrowDown' },
            { x: -1, y: 0, name: 'ArrowLeft' },
            { x: 1, y: 0, name: 'ArrowRight' }
        ];

        // 1. 尝试找到食物的最短路径
        const pathToFood = findPath(head, food, snake);

        if (pathToFood && pathToFood.length > 0) {
            const bestDir = pathToFood[0];
            // 检查走这一步后是否还有足够的逃生空间
            const simulatedSnake = simulateMove(snake, bestDir);
            const space = countReachableSpace(simulatedSnake[0], simulatedSnake);

            // 如果空间足够（至少能容纳蛇身），就走这条路
            if (space >= snake.length) {
                return bestDir.name;
            }
        }

        // 2. 如果去食物的路不安全，选择最安全的方向（跟随尾巴策略）
        let bestDirection = null;
        let bestSpace = -1;

        for (const dir of directions) {
            // 不能反向
            if (snake.length > 1) {
                const neck = snake[1];
                if (head.x + dir.x === neck.x && head.y + dir.y === neck.y) {
                    continue;
                }
            }

            if (isSafeMove(dir, snake)) {
                const simulatedSnake = simulateMove(snake, dir);
                const space = countReachableSpace(simulatedSnake[0], simulatedSnake);

                if (space > bestSpace) {
                    bestSpace = space;
                    bestDirection = dir.name;
                }
            }
        }

        return bestDirection;
    }

    // 执行移动
    function move(direction) {
        if (!direction || !window.isRunning) return;

        // 模拟按键事件
        const keydownEvent = new KeyboardEvent('keydown', {
            key: direction,
            code: direction,
            bubbles: true
        });
        document.dispatchEvent(keydownEvent);
    }

    // 自动游戏循环
    function autoPlay() {
        if (!window.isRunning) {
            console.log('🐍 游戏未开始，等待中...');
            return;
        }

        const direction = getBestMove();
        if (direction) {
            move(direction);
        } else {
            console.log('⚠️ 无路可走，等待游戏结束...');
        }
    }

    // 启动自动游戏
    window.runAutoSnake = function (interval = 80) {
        if (window.autoSnakeRunning) {
            console.log('⚠️ 自动脚本已在运行');
            return;
        }

        console.log('🐍 自动贪吃蛇启动！');
        console.log(`⏱️ 间隔: ${interval}ms`);
        console.log('📝 调用 stopAutoSnake() 可停止');

        window.autoSnakeRunning = true;
        autoInterval = setInterval(autoPlay, interval);
    };

    // 停止自动游戏
    window.stopAutoSnake = function () {
        if (autoInterval) {
            clearInterval(autoInterval);
            autoInterval = null;
        }
        window.autoSnakeRunning = false;
        console.log('🛑 自动脚本已停止');
    };

    console.log('✅ 贪吃蛇自动脚本已加载！');
    console.log('📖 使用方法:');
    console.log('   runAutoSnake()       - 启动自动游戏（默认80ms间隔）');
    console.log('   runAutoSnake(50)     - 启动自动游戏（50ms间隔，更快）');
    console.log('   stopAutoSnake()      - 停止自动游戏');
})();
